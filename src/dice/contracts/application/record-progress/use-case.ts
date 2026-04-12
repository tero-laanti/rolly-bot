import type {
  ContractsCatalogReader,
  ContractsProgressRecorder,
  ContractsProgressRepository,
  ContractsRewardGranter,
  ContractsRotationResolver,
  ContractsRunRepository,
  ContractsUnitOfWork,
  ContractsUserCadenceStateRepository,
} from "../ports";
import { createContractCompletionAnnouncement } from "../completion-announcements";
import type { ContractCompletionAnnouncement } from "../completion-announcements";
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
  catalogReader: ContractsCatalogReader;
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

  const { catalogReader, runRepository, userCadenceStateRepository, rewardGranter, unitOfWork } =
    dependencies;

  const getContractsPerWindow = (cadence: ContractCadence): number => {
    const catalog = catalogReader.getCatalog();
    if (!("panel" in catalog) || Array.isArray(catalog.daily) || Array.isArray(catalog.weekly)) {
      throw new Error("Contract Master authored data is required for this operation.");
    }

    return Math.max(1, (cadence === "daily" ? catalog.daily : catalog.weekly).contractsPerWindow);
  };

  const recordProgress: ContractsProgressRecorder["recordProgress"] = (event) => {
    const updates: ContractProgressUpdate[] = [];
    const contractCompletionAnnouncements: ContractCompletionAnnouncement[] = [];

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
            applyCompletionToCadenceState(
              state,
              update.run,
              event.occurredAt,
              getContractsPerWindow(cadence),
            ),
          );

          const announcement = createContractCompletionAnnouncement({
            userId: event.userId,
            cadence: update.run.cadence,
            contractTitle: update.run.contractTitle,
            rewardPips: update.run.rewardPips,
          });
          if (announcement) {
            contractCompletionAnnouncements.push(announcement);
          }
        }

        updates.push(update);
      }
    });

    if (updates.length < 1) {
      return null;
    }

    return {
      updates,
      contractCompletionAnnouncements,
    };
  };

  return { recordProgress };
};
