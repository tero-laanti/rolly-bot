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
import { getContractResetWindow } from "../../domain/rotation";
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
      resolveCadenceView({
        userId: "__contracts-global-board__",
        cadence,
        now,
      })
        .offers.map((offer) => offer.offer)
        .filter((offer): offer is ContractOffer => Boolean(offer))
        .map(toDefinition);

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
