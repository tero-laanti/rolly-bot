import type {
  ContractsProgressRecorder,
  ContractsProgressRepository,
  ContractsRewardGranter,
  ContractsRotationResolver,
  ContractsRunRepository,
  ContractsUnitOfWork,
  ContractsUserCadenceStateRepository,
} from "../ports";
import {
  applyCompletionToCadenceState,
  createEmptyContractCadenceState,
  getActiveRun,
  type ContractProgressUpdate,
  updateContractRunProgress,
} from "../../domain/progress";
import { getContractResetWindow } from "../../domain/rotation";
import type { ContractCadence } from "../../domain/types";

type ContractMasterDependencies = {
  runRepository: ContractsRunRepository;
  userCadenceStateRepository: ContractsUserCadenceStateRepository;
  rewardGranter: ContractsRewardGranter;
  unitOfWork: ContractsUnitOfWork;
};

type RemovedSharedBoardDependencies = {
  rotationResolver: Pick<ContractsRotationResolver, "resolveActiveRotation">;
  progressRepository: ContractsProgressRepository;
  rewardGranter: ContractsRewardGranter;
  unitOfWork: ContractsUnitOfWork;
};

const contractCadences: ContractCadence[] = ["daily", "weekly"];

export const createRecordContractsProgressUseCase = (
  dependencies: ContractMasterDependencies | RemovedSharedBoardDependencies,
): ContractsProgressRecorder => {
  if ("rotationResolver" in dependencies || "progressRepository" in dependencies) {
    throw new Error(
      "Shared-board contracts progress was removed. Record progress against accepted Contract Master runs instead.",
    );
  }

  const { runRepository, userCadenceStateRepository, rewardGranter, unitOfWork } = dependencies;

  const recordProgress: ContractsProgressRecorder["recordProgress"] = (event) => {
    const updates: ContractProgressUpdate[] = [];

    unitOfWork.runInTransaction(() => {
      for (const cadence of contractCadences) {
        const resetWindow = getContractResetWindow(cadence, event.occurredAt);
        const runs = runRepository.listRuns(event.userId, cadence, resetWindow);
        const activeRun = getActiveRun(runs);
        if (!activeRun) {
          continue;
        }

        const update = updateContractRunProgress(
          activeRun,
          event.objectiveType,
          event.increment,
          event.occurredAt,
        );
        if (!update?.run) {
          continue;
        }

        runRepository.saveRun(update.run);
        const grantedPips = update.rewardGrantedPips ?? 0;
        if (grantedPips > 0) {
          rewardGranter.grantPips?.(event.userId, grantedPips);
        }

        if (update.newlyCompleted) {
          const state =
            userCadenceStateRepository.getState(event.userId, cadence, resetWindow) ??
            createEmptyContractCadenceState(event.userId, cadence, resetWindow);
          userCadenceStateRepository.saveState(
            applyCompletionToCadenceState(state, update.run, event.occurredAt),
          );
        }

        updates.push(update);
      }
    });

    if (updates.length < 1) {
      return null;
    }

    return { updates };
  };

  return { recordProgress };
};
