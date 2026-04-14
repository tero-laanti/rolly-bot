import { buildContractCadenceContext, buildContractCadenceView } from "../contract-master-state";
import type {
  ContractCadenceView,
  ContractsCadenceResolver,
  ContractsCatalogReader,
  ContractsInitialOfferRepository,
  ContractsRerollUsageRepository,
  ContractsRotationRepository,
  ContractsRunRepository,
  ContractsUserCadenceStateRepository,
} from "../ports";
import { deterministicShuffle, getContractResetWindow } from "../../domain/rotation";
import type { ContractCadence, ContractDefinition, ContractOffer } from "../../domain/types";

type ContractMasterDependencies = {
  catalogReader: ContractsCatalogReader;
  initialOfferRepository: ContractsInitialOfferRepository;
  userCadenceStateRepository: ContractsUserCadenceStateRepository;
  runRepository: ContractsRunRepository;
  rerollUsageRepository: ContractsRerollUsageRepository;
};

type RemovedSharedBoardDependencies = {
  catalogReader: ContractsCatalogReader;
  rotationRepository: ContractsRotationRepository;
};

const toDefinition = (offer: ContractOffer): ContractDefinition => ({
  id: offer.id,
  title: offer.title,
  description: offer.description,
  cadence: offer.cadence,
  objective: offer.objective,
  reward: {
    fame: 0,
    pips: offer.rewardPips,
  },
});

const buildActiveRotationContracts = ({
  cadence,
  context,
}: {
  cadence: ContractCadence;
  context: ReturnType<typeof buildContractCadenceContext>;
}): ContractDefinition[] => {
  const seen = new Set<string>();
  const contracts = Object.values(context.cadenceCatalog.difficulties)
    .flatMap((pool) => [...pool.initialOffers, ...pool.refillOffers])
    .filter((offer) => {
      if (seen.has(offer.id)) {
        return false;
      }

      seen.add(offer.id);
      return true;
    })
    .map(toDefinition);

  return deterministicShuffle(contracts, `${cadence}-${context.resetWindow}`).slice(
    0,
    context.cadenceCatalog.contractsPerWindow,
  );
};

export const createResolveContractCadenceViewUseCase = ({
  catalogReader,
  initialOfferRepository,
  userCadenceStateRepository,
  runRepository,
  rerollUsageRepository,
}: ContractMasterDependencies): ContractsCadenceResolver => {
  const resolveCadenceView = ({
    userId,
    cadence,
    now,
  }: {
    userId: string;
    cadence: "daily" | "weekly";
    now: Date;
  }): ContractCadenceView => {
    const context = buildContractCadenceContext(
      {
        catalogReader,
        initialOfferRepository,
        userCadenceStateRepository,
        runRepository,
        rerollUsageRepository,
      },
      userId,
      cadence,
      now,
    );

    return buildContractCadenceView(context, initialOfferRepository, now);
  };

  const resolveActiveRotation = (now: Date) => {
    const buildContracts = (cadence: ContractCadence) =>
      buildActiveRotationContracts({
        cadence,
        context: buildContractCadenceContext(
          {
            catalogReader,
            initialOfferRepository,
            userCadenceStateRepository,
            runRepository,
            rerollUsageRepository,
          },
          "__contracts-global-board__",
          cadence,
          now,
        ),
      });

    return {
      daily: {
        cadence: "daily" as const,
        periodKey: getContractResetWindow("daily", now),
        contracts: buildContracts("daily"),
      },
      weekly: {
        cadence: "weekly" as const,
        periodKey: getContractResetWindow("weekly", now),
        contracts: buildContracts("weekly"),
      },
    };
  };

  return { resolveCadenceView, resolveActiveRotation };
};

export const createResolveContractsRotationUseCase = (
  dependencies: ContractMasterDependencies | RemovedSharedBoardDependencies,
): ContractsCadenceResolver => {
  if ("rotationRepository" in dependencies) {
    throw new Error(
      "Shared-board contract rotations were removed. Use Contract Master cadence resolution instead.",
    );
  }

  return createResolveContractCadenceViewUseCase(dependencies);
};
