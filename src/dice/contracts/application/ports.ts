import type { UnitOfWork } from "../../../shared-kernel/application/unit-of-work";
import type { ContractCompletionAnnouncement } from "./completion-announcements";
import type {
  ContractAcceptedVia,
  ContractCadenceState,
  ContractOfferChoice,
  ContractProgress,
  ContractProgressUpdate,
  ContractRun,
} from "../domain/progress";
import type {
  ContractCadence,
  ContractCatalog,
  ContractDefinition,
  ContractDifficulty,
  ContractObjectiveType,
  ContractOffer,
  ContractReward,
} from "../domain/types";

export type LegacyContractCatalog = {
  daily: ContractDefinition[];
  weekly: ContractDefinition[];
};

export interface ContractsCatalogReader {
  getCatalog(): ContractCatalog | LegacyContractCatalog;
}

export type ContractRotationRecord = {
  cadence: ContractCadence;
  periodKey: string;
  contractIds: string[];
  activatedAt: Date;
  resetAt: Date;
};

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

export interface ContractsInitialOfferRepository {
  getOffer(
    cadence: ContractCadence,
    difficulty: ContractDifficulty,
    resetWindow: string,
  ): { contractId: string } | null;
  listOffers(
    cadence: ContractCadence,
    resetWindow: string,
  ): Array<{
    difficulty: ContractDifficulty;
    contractId: string;
  }>;
  saveOffer(record: {
    cadence: ContractCadence;
    difficulty: ContractDifficulty;
    resetWindow: string;
    contractId: string;
    createdAt: Date;
  }): void;
}

export interface ContractsUserCadenceStateRepository {
  getState(
    userId: string,
    cadence: ContractCadence,
    resetWindow: string,
  ): ContractCadenceState | null;
  saveState(record: ContractCadenceState): void;
}

export interface ContractsRunRepository {
  getRun(
    userId: string,
    cadence: ContractCadence,
    resetWindow: string,
    sequenceNumber: number,
  ): ContractRun | null;
  listRuns(userId: string, cadence: ContractCadence, resetWindow: string): ContractRun[];
  saveRun(record: ContractRun): void;
}

export interface ContractsRerollUsageRepository {
  getUsage(
    userId: string,
    cadence: ContractCadence,
    resetWindow: string,
    difficulty: ContractDifficulty,
  ): { usedAt: Date } | null;
  listUsage(
    userId: string,
    cadence: ContractCadence,
    resetWindow: string,
  ): Array<{ difficulty: ContractDifficulty; usedAt: Date }>;
  saveUsage(record: {
    userId: string;
    cadence: ContractCadence;
    resetWindow: string;
    difficulty: ContractDifficulty;
    usedAt: Date;
  }): void;
}

export interface ContractsRewardGranter {
  grantPips?: (userId: string, pips: number) => void;
  grantReward?: (userId: string, reward: ContractReward) => void;
}

export type ContractsProgressEvent = {
  userId: string;
  objectiveType: ContractObjectiveType;
  increment: number;
  occurredAt: Date;
};

export type ContractsProgressResult = {
  updates: ContractProgressUpdate[];
  contractCompletionAnnouncements?: ContractCompletionAnnouncement[];
};

export interface ContractsProgressRecorder {
  recordProgress(event: ContractsProgressEvent): ContractsProgressResult | null;
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

export type ContractOfferView = {
  difficulty: ContractDifficulty;
  label: string;
  rewardPips: number;
  offer: ContractOffer | null;
  source: ContractAcceptedVia | null;
  rerollUsed: boolean;
  rerollAvailable: boolean;
  selectable: boolean;
  unavailableReason?: string;
};

export type ContractCadenceView = {
  cadence: ContractCadence;
  label: string;
  chooserTitle: string;
  chooserDescription: string;
  resetWindow: string;
  resetAt: Date;
  activeRun: ContractRun | null;
  completionCount: number;
  refillAvailableDifficulty?: ContractDifficulty;
  refillClaimed: boolean;
  offers: ContractOfferView[];
};

export interface ContractsCadenceResolver {
  resolveCadenceView(input: {
    userId: string;
    cadence: ContractCadence;
    now: Date;
  }): ContractCadenceView;
  resolveActiveRotation: (now: Date) => {
    daily: { cadence: ContractCadence; periodKey: string; contracts: ContractDefinition[] };
    weekly: { cadence: ContractCadence; periodKey: string; contracts: ContractDefinition[] };
  };
}

export interface ContractsRotationResolver {
  resolveActiveRotation(now: Date): {
    daily: { cadence: ContractCadence; periodKey: string; contracts: ContractDefinition[] };
    weekly: { cadence: ContractCadence; periodKey: string; contracts: ContractDefinition[] };
  };
}

export type ContractSelectionResult = {
  cadenceView: ContractCadenceView;
  acceptedRun: ContractRun;
  acceptedChoice: ContractOfferChoice;
};

export interface ContractsSelectionManager {
  acceptOffer(input: {
    userId: string;
    cadence: ContractCadence;
    difficulty: ContractDifficulty;
    now: Date;
  }): ContractSelectionResult;
  rerollOffer(input: {
    userId: string;
    cadence: ContractCadence;
    difficulty: ContractDifficulty;
    now: Date;
  }): ContractCadenceView;
}

export type QueryContractsDependencies = {
  cadenceResolver: ContractsCadenceResolver | null;
};

export type ContractsUnitOfWork = UnitOfWork;
