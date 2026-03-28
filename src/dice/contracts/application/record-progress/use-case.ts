import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type {
  ContractsProgressRecorder,
  ContractsProgressRepository,
  ContractsProgressResult,
  ContractsRewardGranter,
  ContractsRotationResolver,
} from "../ports";
import { createContractProgress, recordProgressAcrossContracts } from "../../domain/progress";
import type { ContractObjectiveType } from "../../domain/types";

type Dependencies = {
  rotationResolver: ContractsRotationResolver;
  progressRepository: ContractsProgressRepository;
  rewardGranter: ContractsRewardGranter;
  unitOfWork: UnitOfWork;
};

const hasProgressChanged = (
  before: ReturnType<typeof createContractProgress>,
  after: ReturnType<typeof createContractProgress>,
) =>
  before.currentCount !== after.currentCount ||
  (before.completedAt?.getTime() ?? 0) !== (after.completedAt?.getTime() ?? 0) ||
  (before.rewardedAt?.getTime() ?? 0) !== (after.rewardedAt?.getTime() ?? 0);

const supportedObjectiveTypes = new Set<ContractObjectiveType>([
  "roll_count",
  "pvp_win_count",
  "casino_game_count",
  "world_boss_join_count",
]);

export const createRecordContractsProgressUseCase = ({
  rotationResolver,
  progressRepository,
  rewardGranter,
  unitOfWork,
}: Dependencies): ContractsProgressRecorder => {
  const recordProgress: ContractsProgressRecorder["recordProgress"] = (event) => {
    const rotations = rotationResolver.resolveActiveRotation(event.occurredAt);
    const activeContracts = [
      ...rotations.daily.contracts.map((contract) => ({
        contract,
        periodKey: rotations.daily.periodKey,
      })),
      ...rotations.weekly.contracts.map((contract) => ({
        contract,
        periodKey: rotations.weekly.periodKey,
      })),
    ];

    for (const { contract } of activeContracts) {
      if (!supportedObjectiveTypes.has(contract.objective.type)) {
        throw new Error(`Unsupported contract objective type: ${contract.objective.type}`);
      }
    }

    const eligibleContracts = activeContracts.filter(
      ({ contract }) => contract.objective.type === event.objectiveType,
    );

    if (eligibleContracts.length < 1) {
      return null;
    }

    const updates: ContractsProgressResult["updates"] = [];

    unitOfWork.runInTransaction(() => {
      for (const { contract, periodKey } of eligibleContracts) {
        const existing =
          progressRepository.getProgress(event.userId, contract.id, contract.cadence, periodKey) ??
          createContractProgress(contract);

        const [update] = recordProgressAcrossContracts(
          [existing],
          event.objectiveType,
          event.increment,
          event.occurredAt,
        );

        if (!update) {
          continue;
        }

        const changed = hasProgressChanged(existing, update.update.progress);
        if (!changed && !update.update.rewardGranted) {
          continue;
        }

        if (update.update.rewardGranted) {
          rewardGranter.grantReward(event.userId, update.update.rewardGranted);
        }

        progressRepository.saveProgress(event.userId, update.update.progress, periodKey);

        updates.push({
          progress: update.update.progress,
          rewardGranted: update.update.rewardGranted,
        });
      }
    });

    if (updates.length < 1) {
      return null;
    }

    return { updates };
  };

  return { recordProgress };
};
