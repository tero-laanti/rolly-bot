import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import {
  buildContractCadenceContext,
  buildContractCadenceView,
  resolveContractOfferChoice,
} from "../contract-master-state";
import { createAcceptedRun, getActiveRun, type ContractAcceptedVia } from "../../domain/progress";
import type {
  ContractsCatalogReader,
  ContractsInitialOfferRepository,
  ContractsRerollUsageRepository,
  ContractsRunRepository,
  ContractsSelectionManager,
  ContractsUserCadenceStateRepository,
} from "../ports";
import type { ContractCadence, ContractDifficulty } from "../../domain/types";

type Dependencies = {
  catalogReader: ContractsCatalogReader;
  initialOfferRepository: ContractsInitialOfferRepository;
  userCadenceStateRepository: ContractsUserCadenceStateRepository;
  runRepository: ContractsRunRepository;
  rerollUsageRepository: ContractsRerollUsageRepository;
  unitOfWork: UnitOfWork;
};

const withRerollUsage = (
  context: ReturnType<typeof buildContractCadenceContext>,
  difficulty: ContractDifficulty,
  usedAt: Date,
) => ({
  ...context,
  rerollUsage: new Map(context.rerollUsage).set(difficulty, usedAt),
});

const assertAcceptableChoice = (
  choice: ReturnType<typeof resolveContractOfferChoice>,
  cadence: ContractCadence,
  difficulty: ContractDifficulty,
): NonNullable<typeof choice> => {
  if (!choice) {
    throw new Error(`No ${cadence} ${difficulty} contract is currently available.`);
  }

  return choice;
};

export const createManageContractMasterUseCase = ({
  catalogReader,
  initialOfferRepository,
  userCadenceStateRepository,
  runRepository,
  rerollUsageRepository,
  unitOfWork,
}: Dependencies): ContractsSelectionManager => {
  const resolveContext = (userId: string, cadence: ContractCadence, now: Date) =>
    buildContractCadenceContext(
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

  const acceptOffer: ContractsSelectionManager["acceptOffer"] = ({
    userId,
    cadence,
    difficulty,
    now,
  }) => {
    let acceptedRun = null;
    let acceptedChoice = null;

    unitOfWork.runInTransaction(() => {
      const context = resolveContext(userId, cadence, now);
      const choice = assertAcceptableChoice(
        resolveContractOfferChoice(context, initialOfferRepository, difficulty, now),
        cadence,
        difficulty,
      );

      if (getActiveRun(context.runs)) {
        throw new Error(`You already have an active ${cadence} contract.`);
      }

      const nextSequenceNumber = context.runs.length + 1;
      const run = createAcceptedRun(choice, userId, context.resetWindow, nextSequenceNumber, now);
      runRepository.saveRun(run);

      if (choice.source === "refill") {
        userCadenceStateRepository.saveState({
          ...context.state,
          refillClaimedAt: now,
        });
      } else if (
        choice.source === "reroll" &&
        !rerollUsageRepository.getUsage(userId, cadence, context.resetWindow, difficulty)
      ) {
        throw new Error(`No ${cadence} ${difficulty} reroll has been recorded for this user.`);
      }

      acceptedRun = run;
      acceptedChoice = choice;
    });

    const cadenceView = buildContractCadenceView(
      resolveContext(userId, cadence, now),
      initialOfferRepository,
      now,
    );

    if (!acceptedRun || !acceptedChoice) {
      throw new Error(`Failed to accept ${cadence} ${difficulty} contract.`);
    }

    return {
      cadenceView,
      acceptedRun,
      acceptedChoice,
    };
  };

  const rerollOffer: ContractsSelectionManager["rerollOffer"] = ({
    userId,
    cadence,
    difficulty,
    now,
  }) => {
    unitOfWork.runInTransaction(() => {
      const context = resolveContext(userId, cadence, now);
      if (context.state.completionCount !== 0) {
        throw new Error(`Rerolls are only available before you complete a ${cadence} contract.`);
      }

      if (getActiveRun(context.runs)) {
        throw new Error(`Finish your active ${cadence} contract before rerolling.`);
      }

      if (rerollUsageRepository.getUsage(userId, cadence, context.resetWindow, difficulty)) {
        throw new Error(`You have already used your ${cadence} ${difficulty} reroll.`);
      }

      const choice = assertAcceptableChoice(
        resolveContractOfferChoice(context, initialOfferRepository, difficulty, now),
        cadence,
        difficulty,
      );

      if (choice.source !== ("initial" satisfies ContractAcceptedVia)) {
        throw new Error(`The ${cadence} ${difficulty} offer can no longer be rerolled.`);
      }

      const rerolledChoice = resolveContractOfferChoice(
        withRerollUsage(context, difficulty, now),
        initialOfferRepository,
        difficulty,
        now,
      );
      if (!rerolledChoice || rerolledChoice.offer.id === choice.offer.id) {
        throw new Error(`No alternate ${cadence} ${difficulty} contract is available to reroll.`);
      }

      rerollUsageRepository.saveUsage({
        userId,
        cadence,
        resetWindow: context.resetWindow,
        difficulty,
        usedAt: now,
      });
    });

    return buildContractCadenceView(
      resolveContext(userId, cadence, now),
      initialOfferRepository,
      now,
    );
  };

  return { acceptOffer, rerollOffer };
};
