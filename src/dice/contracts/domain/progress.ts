import type {
  ContractCadence,
  ContractDifficulty,
  ContractObjectiveType,
  ContractDefinition,
  ContractReward,
  ContractOffer,
} from "./types";

export type ContractAcceptedVia = "initial" | "reroll" | "refill";

export type ContractCadenceState = {
  userId: string;
  cadence: ContractCadence;
  resetWindow: string;
  completionCount: number;
  refillAvailableDifficulty?: ContractDifficulty;
  refillClaimedAt?: Date;
  lastCompletedAt?: Date;
};

export type ContractRun = {
  userId: string;
  cadence: ContractCadence;
  resetWindow: string;
  sequenceNumber: number;
  contractId: string;
  contractTitle: string;
  contractDescription: string;
  difficulty: ContractDifficulty;
  objectiveType: string;
  requiredCount: number;
  currentCount: number;
  acceptedVia: ContractAcceptedVia;
  acceptedAt: Date;
  completedAt?: Date;
  rewardPips: number;
  rewardGrantedAt?: Date;
};

export type ContractOfferSource = "initial" | "reroll" | "refill";

export type ContractOfferChoice = {
  cadence: ContractCadence;
  difficulty: ContractDifficulty;
  source: ContractOfferSource;
  offer: ContractOffer;
  rerollUsed: boolean;
  rerollAvailable: boolean;
};

export type ContractProgressUpdate = {
  run?: ContractRun;
  rewardGrantedPips?: number;
  newlyCompleted?: boolean;
  progress?: ContractProgress;
  rewardGranted?: ContractReward | null;
};

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

export const createEmptyContractCadenceState = (
  userId: string,
  cadence: ContractCadence,
  resetWindow: string,
): ContractCadenceState => ({
  userId,
  cadence,
  resetWindow,
  completionCount: 0,
});

export const getActiveRun = (runs: readonly ContractRun[]): ContractRun | null => {
  return runs.find((run) => !run.completedAt) ?? null;
};

export const getCompletedRuns = (runs: readonly ContractRun[]): ContractRun[] => {
  return runs.filter((run) => Boolean(run.completedAt));
};

export const getUsedContractIds = (runs: readonly ContractRun[]): Set<string> => {
  return new Set(runs.map((run) => run.contractId));
};

export const createAcceptedRun = (
  choice: ContractOfferChoice,
  userId: string,
  resetWindow: string,
  sequenceNumber: number,
  acceptedAt: Date,
): ContractRun => ({
  userId,
  cadence: choice.cadence,
  resetWindow,
  sequenceNumber,
  contractId: choice.offer.id,
  contractTitle: choice.offer.title,
  contractDescription: choice.offer.description,
  difficulty: choice.difficulty,
  objectiveType: choice.offer.objective.type,
  requiredCount: choice.offer.objective.requiredCount,
  currentCount: 0,
  acceptedVia: choice.source,
  acceptedAt,
  rewardPips: choice.offer.rewardPips,
});

export const updateContractRunProgress = (
  run: ContractRun,
  objectiveType: ContractObjectiveType,
  increment: number,
  occurredAt: Date,
): ContractProgressUpdate | null => {
  const toTimestamp = (value: Date | undefined): number => value?.getTime() ?? 0;

  if (run.objectiveType !== objectiveType || increment <= 0) {
    return null;
  }

  if (run.rewardGrantedAt) {
    return null;
  }

  const nextCount = Math.min(run.currentCount + increment, run.requiredCount);
  const completedAt =
    nextCount >= run.requiredCount ? (run.completedAt ?? occurredAt) : run.completedAt;
  const rewardGrantedPips =
    nextCount >= run.requiredCount && !run.rewardGrantedAt ? run.rewardPips : 0;

  const updatedRun: ContractRun = {
    ...run,
    currentCount: nextCount,
    completedAt,
    rewardGrantedAt: rewardGrantedPips > 0 ? occurredAt : run.rewardGrantedAt,
  };

  if (
    updatedRun.currentCount === run.currentCount &&
    toTimestamp(updatedRun.completedAt) === toTimestamp(run.completedAt) &&
    toTimestamp(updatedRun.rewardGrantedAt) === toTimestamp(run.rewardGrantedAt)
  ) {
    return null;
  }

  return {
    run: updatedRun,
    rewardGrantedPips,
    newlyCompleted: !run.completedAt && Boolean(updatedRun.completedAt),
  };
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

export const applyCompletionToCadenceState = (
  state: ContractCadenceState,
  completedRun: ContractRun,
  occurredAt: Date,
  contractsPerWindow: number,
): ContractCadenceState => {
  const nextCompletionCount = Math.min(state.completionCount + 1, Math.max(1, contractsPerWindow));
  if (nextCompletionCount >= Math.max(1, contractsPerWindow)) {
    return {
      ...state,
      completionCount: nextCompletionCount,
      refillAvailableDifficulty: undefined,
      lastCompletedAt: occurredAt,
    };
  }

  return {
    ...state,
    completionCount: nextCompletionCount,
    refillAvailableDifficulty: completedRun.difficulty,
    lastCompletedAt: occurredAt,
  };
};
