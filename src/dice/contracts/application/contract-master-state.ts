import type {
  ContractCadenceView,
  ContractOfferView,
  ContractsCatalogReader,
  ContractsInitialOfferRepository,
  LegacyContractCatalog,
  ContractsRerollUsageRepository,
  ContractsRunRepository,
  ContractsUserCadenceStateRepository,
} from "./ports";
import {
  createEmptyContractCadenceState,
  getActiveRun,
  getCompletedRuns,
  getUsedContractIds,
  type ContractCadenceState,
  type ContractOfferChoice,
  type ContractRun,
} from "../domain/progress";
import {
  contractDifficulties,
  findDeterministicOffer,
  getContractResetAt,
  getContractResetWindow,
  pickDeterministicOffer,
} from "../domain/rotation";
import type {
  ContractCadence,
  ContractCadenceCatalog,
  ContractCatalog,
  ContractDifficulty,
  ContractDifficultyPool,
  ContractOffer,
} from "../domain/types";

type ContractMasterReadDependencies = {
  catalogReader: ContractsCatalogReader;
  initialOfferRepository: ContractsInitialOfferRepository;
  userCadenceStateRepository: ContractsUserCadenceStateRepository;
  runRepository: ContractsRunRepository;
  rerollUsageRepository: ContractsRerollUsageRepository;
};

type CadenceStateContext = {
  catalog: ContractCatalog;
  cadenceCatalog: ContractCadenceCatalog;
  cadence: ContractCadence;
  resetWindow: string;
  resetAt: Date;
  state: ContractCadenceState;
  runs: ContractRun[];
  activeRun: ContractRun | null;
  rerollUsage: Map<ContractDifficulty, Date>;
};

const getContractsPerWindow = (cadenceCatalog: ContractCadenceCatalog): number => {
  return Math.max(1, cadenceCatalog.contractsPerWindow);
};

const getCadenceCatalog = (
  catalog: ContractCatalog,
  cadence: ContractCadence,
): ContractCadenceCatalog => {
  return cadence === "daily" ? catalog.daily : catalog.weekly;
};

const assertContractMasterCatalog = (
  catalog: ContractCatalog | LegacyContractCatalog,
): ContractCatalog => {
  if ("panel" in catalog && !Array.isArray(catalog.daily) && !Array.isArray(catalog.weekly)) {
    return catalog;
  }

  throw new Error("Contract Master authored data is required for this operation.");
};

const getDifficultyPool = (
  cadenceCatalog: ContractCadenceCatalog,
  difficulty: ContractDifficulty,
): ContractDifficultyPool => {
  return cadenceCatalog.difficulties[difficulty];
};

const ensureInitialOffer = (
  repository: ContractsInitialOfferRepository,
  cadenceCatalog: ContractCadenceCatalog,
  cadence: ContractCadence,
  difficulty: ContractDifficulty,
  resetWindow: string,
  now: Date,
): ContractOffer => {
  const persisted = repository.getOffer(cadence, difficulty, resetWindow);
  const pool = getDifficultyPool(cadenceCatalog, difficulty);

  if (persisted) {
    const offer = pool.initialOffers.find((entry) => entry.id === persisted.contractId);
    if (!offer) {
      throw new Error(
        `Persisted ${cadence} Contract Master offer ${persisted.contractId} no longer matches the catalog.`,
      );
    }
    return offer;
  }

  const selected = pickDeterministicOffer(
    pool.initialOffers,
    `contracts:initial:${cadence}:${difficulty}:${resetWindow}`,
    new Set(),
  );

  repository.saveOffer({
    cadence,
    difficulty,
    resetWindow,
    contractId: selected.id,
    createdAt: now,
  });

  return selected;
};

const resolveInitialChoice = (
  context: CadenceStateContext,
  repository: ContractsInitialOfferRepository,
  difficulty: ContractDifficulty,
  now: Date,
): ContractOfferChoice | null => {
  const globalInitialOffer = ensureInitialOffer(
    repository,
    context.cadenceCatalog,
    context.cadence,
    difficulty,
    context.resetWindow,
    now,
  );
  const rerollUsed = context.rerollUsage.has(difficulty);
  if (!rerollUsed) {
    return {
      cadence: context.cadence,
      difficulty,
      source: "initial",
      offer: globalInitialOffer,
      rerollUsed: false,
      rerollAvailable: true,
    };
  }

  const excludedIds = getUsedContractIds(context.runs);
  excludedIds.add(globalInitialOffer.id);
  const rerolledOffer = findDeterministicOffer(
    getDifficultyPool(context.cadenceCatalog, difficulty).initialOffers,
    `contracts:reroll:${context.cadence}:${difficulty}:${context.resetWindow}:${context.state.userId}`,
    excludedIds,
  );
  if (!rerolledOffer) {
    return null;
  }

  return {
    cadence: context.cadence,
    difficulty,
    source: "reroll",
    offer: rerolledOffer,
    rerollUsed: true,
    rerollAvailable: false,
  };
};

const resolveRefillChoice = (
  context: CadenceStateContext,
  difficulty: ContractDifficulty,
): ContractOfferChoice | null => {
  const excludedIds = getUsedContractIds(context.runs);
  const refillOffer = findDeterministicOffer(
    getDifficultyPool(context.cadenceCatalog, difficulty).refillOffers,
    `contracts:refill:${context.cadence}:${difficulty}:${context.resetWindow}:${context.state.userId}`,
    excludedIds,
  );
  if (!refillOffer) {
    return null;
  }

  return {
    cadence: context.cadence,
    difficulty,
    source: "refill",
    offer: refillOffer,
    rerollUsed: Boolean(context.rerollUsage.get(difficulty)),
    rerollAvailable: false,
  };
};

export const buildContractCadenceContext = (
  dependencies: ContractMasterReadDependencies,
  userId: string,
  cadence: ContractCadence,
  now: Date,
): CadenceStateContext => {
  const catalog = assertContractMasterCatalog(dependencies.catalogReader.getCatalog());
  const cadenceCatalog = getCadenceCatalog(catalog, cadence);
  const resetWindow = getContractResetWindow(cadence, now);
  const resetAt = getContractResetAt(cadence, resetWindow);
  const runs = dependencies.runRepository.listRuns(userId, cadence, resetWindow);
  const completedRuns = getCompletedRuns(runs);
  const persistedState =
    dependencies.userCadenceStateRepository.getState(userId, cadence, resetWindow) ??
    createEmptyContractCadenceState(userId, cadence, resetWindow);
  const contractsPerWindow = getContractsPerWindow(cadenceCatalog);
  const completionCount = Math.min(
    Math.max(persistedState.completionCount, completedRuns.length),
    contractsPerWindow,
  );
  const refillAvailableDifficulty =
    completionCount >= 1 && completionCount < contractsPerWindow
      ? (persistedState.refillAvailableDifficulty ?? completedRuns[0]?.difficulty)
      : undefined;
  const refillClaimedAt =
    completionCount >= contractsPerWindow
      ? (persistedState.refillClaimedAt ?? completedRuns.at(-1)?.completedAt)
      : undefined;
  const state: ContractCadenceState = {
    ...persistedState,
    completionCount,
    refillAvailableDifficulty,
    refillClaimedAt,
  };
  const activeRun = getActiveRun(runs);
  const rerollUsage = new Map(
    dependencies.rerollUsageRepository
      .listUsage(userId, cadence, resetWindow)
      .map((entry) => [entry.difficulty, entry.usedAt] as const),
  );

  return {
    catalog,
    cadenceCatalog,
    cadence,
    resetWindow,
    resetAt,
    state,
    runs,
    activeRun,
    rerollUsage,
  };
};

export const resolveContractOfferChoice = (
  context: CadenceStateContext,
  repository: ContractsInitialOfferRepository,
  difficulty: ContractDifficulty,
  now: Date,
): ContractOfferChoice | null => {
  const contractsPerWindow = getContractsPerWindow(context.cadenceCatalog);
  if (context.activeRun || context.state.completionCount >= contractsPerWindow) {
    return null;
  }

  if (context.state.completionCount === 0) {
    return resolveInitialChoice(context, repository, difficulty, now);
  }

  if (context.state.refillAvailableDifficulty !== difficulty) {
    return null;
  }

  return resolveRefillChoice(context, difficulty);
};

const buildOfferView = (
  context: CadenceStateContext,
  repository: ContractsInitialOfferRepository,
  difficulty: ContractDifficulty,
  now: Date,
): ContractOfferView => {
  const pool = getDifficultyPool(context.cadenceCatalog, difficulty);
  const choice = resolveContractOfferChoice(context, repository, difficulty, now);

  if (choice) {
    return {
      difficulty,
      label: pool.label,
      rewardPips: pool.rewardPips,
      offer: choice.offer,
      source: choice.source,
      rerollUsed: choice.rerollUsed,
      rerollAvailable: choice.rerollAvailable,
      selectable: !context.activeRun,
    };
  }

  if (context.activeRun) {
    return {
      difficulty,
      label: pool.label,
      rewardPips: pool.rewardPips,
      offer: null,
      source: null,
      rerollUsed: Boolean(context.rerollUsage.get(difficulty)),
      rerollAvailable: false,
      selectable: false,
      unavailableReason: "Finish your active contract before taking another one in this cadence.",
    };
  }

  const contractsPerWindow = getContractsPerWindow(context.cadenceCatalog);
  if (context.state.completionCount >= contractsPerWindow) {
    return {
      difficulty,
      label: pool.label,
      rewardPips: pool.rewardPips,
      offer: null,
      source: null,
      rerollUsed: Boolean(context.rerollUsage.get(difficulty)),
      rerollAvailable: false,
      selectable: false,
      unavailableReason: "You have completed every available contract for this cadence.",
    };
  }

  if (
    context.state.completionCount >= 1 &&
    context.state.refillAvailableDifficulty !== difficulty
  ) {
    return {
      difficulty,
      label: pool.label,
      rewardPips: pool.rewardPips,
      offer: null,
      source: null,
      rerollUsed: Boolean(context.rerollUsage.get(difficulty)),
      rerollAvailable: false,
      selectable: false,
      unavailableReason:
        "Your remaining contracts this window must come from the difficulty of your first completion.",
    };
  }

  return {
    difficulty,
    label: pool.label,
    rewardPips: pool.rewardPips,
    offer: null,
    source: null,
    rerollUsed: Boolean(context.rerollUsage.get(difficulty)),
    rerollAvailable: false,
    selectable: false,
    unavailableReason: "No contract is currently available for this difficulty.",
  };
};

export const buildContractCadenceView = (
  context: CadenceStateContext,
  repository: ContractsInitialOfferRepository,
  now: Date,
): ContractCadenceView => ({
  cadence: context.cadence,
  label: context.cadenceCatalog.label,
  chooserTitle: context.cadenceCatalog.chooserTitle,
  chooserDescription: context.cadenceCatalog.chooserDescription,
  contractsPerWindow: getContractsPerWindow(context.cadenceCatalog),
  resetWindow: context.resetWindow,
  resetAt: context.resetAt,
  activeRun: context.activeRun,
  completionCount: context.state.completionCount,
  refillAvailableDifficulty: context.state.refillAvailableDifficulty,
  refillClaimed: Boolean(context.state.refillClaimedAt),
  offers: contractDifficulties.map((difficulty) =>
    buildOfferView(context, repository, difficulty, now),
  ),
});
