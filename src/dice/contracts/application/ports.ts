import type { ContractRotation } from "../domain/rotation";
import type {
  ContractCadence,
  ContractDefinition,
  ContractObjectiveType,
  ContractReward,
} from "../domain/types";
import type { ContractProgress } from "../domain/progress";

export type ContractRotationRecord = {
  cadence: ContractCadence;
  periodKey: string;
  contractIds: string[];
  activatedAt: Date;
  resetAt: Date;
};

export interface ContractsCatalogReader {
  getCatalog(): { daily: ContractDefinition[]; weekly: ContractDefinition[] };
}

export interface ContractsRotationRepository {
  getRotation(cadence: ContractCadence, periodKey: string): ContractRotationRecord | null;
  saveRotation(record: ContractRotationRecord): void;
}

export type ContractProgressRecord = ContractProgress;

export interface ContractsProgressRepository {
  getProgress(
    userId: string,
    contractId: string,
    cadence: ContractCadence,
    periodKey: string,
  ): ContractProgressRecord | null;
  saveProgress(userId: string, progress: ContractProgressRecord, periodKey: string): void;
}

export interface ContractsRewardGranter {
  grantReward(userId: string, reward: ContractReward): void;
}

export type ContractsProgressEvent = {
  userId: string;
  objectiveType: ContractObjectiveType;
  increment: number;
  occurredAt: Date;
};

export type ContractsProgressUpdate = {
  progress: ContractProgressRecord;
  rewardGranted: ContractReward | null;
};

export type ContractsProgressResult = {
  updates: ContractsProgressUpdate[];
};

export interface ContractsProgressRecorder {
  recordProgress(event: ContractsProgressEvent): ContractsProgressResult | null;
}

export interface ContractsRotationResolver {
  resolveActiveRotation(now: Date): {
    daily: ContractRotation;
    weekly: ContractRotation;
  };
}

export type ContractsGameplayProgressEvent = {
  userId: string;
  occurredAt: Date;
};

export interface ContractsGameplayProgressPort {
  recordRoll(event: ContractsGameplayProgressEvent): ContractsProgressResult | null;
  recordPvpWin(event: ContractsGameplayProgressEvent): ContractsProgressResult | null;
  recordCasinoGameCompletion(event: ContractsGameplayProgressEvent): ContractsProgressResult | null;
  recordWorldBossJoin(event: ContractsGameplayProgressEvent): ContractsProgressResult | null;
}
