import type {
  ContractCadence,
  ContractDefinition,
  ContractObjectiveType,
  ContractReward,
} from "./types";

export type ContractProgress = {
  contractId: string;
  cadence: ContractCadence;
  objectiveType: ContractObjectiveType;
  requiredCount: number;
  currentCount: number;
  completedAt?: Date;
  rewardedAt?: Date;
  reward: ContractReward;
};

export type ProgressUpdateResult = {
  progress: ContractProgress;
  newlyCompleted: boolean;
  rewardGranted: ContractReward | null;
};

export type MultiProgressUpdate = {
  contractId: string;
  cadence: ContractCadence;
  update: ProgressUpdateResult;
};

export const createContractProgress = (contract: ContractDefinition): ContractProgress => ({
  contractId: contract.id,
  cadence: contract.cadence,
  objectiveType: contract.objective.type,
  requiredCount: contract.objective.requiredCount,
  currentCount: 0,
  reward: contract.reward,
});

export const recordProgress = (
  progress: ContractProgress,
  objectiveType: ContractObjectiveType,
  increment: number,
  now: Date,
): ProgressUpdateResult => {
  if (objectiveType !== progress.objectiveType) {
    return { progress, newlyCompleted: false, rewardGranted: null };
  }

  if (progress.rewardedAt) {
    // Already rewarded; idempotent no-op aside from clamping count.
    const clampedCount = Math.min(progress.currentCount, progress.requiredCount);
    if (clampedCount === progress.currentCount) {
      return { progress, newlyCompleted: false, rewardGranted: null };
    }
    return {
      progress: { ...progress, currentCount: clampedCount },
      newlyCompleted: false,
      rewardGranted: null,
    };
  }

  if (increment <= 0) {
    return { progress, newlyCompleted: false, rewardGranted: null };
  }

  const nextCount = Math.min(progress.currentCount + increment, progress.requiredCount);

  if (nextCount < progress.requiredCount) {
    return {
      progress: {
        ...progress,
        currentCount: nextCount,
      },
      newlyCompleted: false,
      rewardGranted: null,
    };
  }

  const completionTime = progress.completedAt ?? now;
  return {
    progress: {
      ...progress,
      currentCount: nextCount,
      completedAt: completionTime,
      rewardedAt: now,
    },
    newlyCompleted: progress.completedAt === undefined,
    rewardGranted: progress.reward,
  };
};

export const recordProgressAcrossContracts = (
  activeProgress: ContractProgress[],
  objectiveType: ContractObjectiveType,
  increment: number,
  now: Date,
): MultiProgressUpdate[] => {
  const updates: MultiProgressUpdate[] = [];

  for (const progress of activeProgress) {
    const update = recordProgress(progress, objectiveType, increment, now);
    if (update.progress === progress) {
      continue;
    }

    updates.push({
      contractId: progress.contractId,
      cadence: progress.cadence,
      update,
    });
  }

  return updates;
};
