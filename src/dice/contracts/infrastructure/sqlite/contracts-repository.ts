import type { SqliteDatabase } from "../../../../shared/db";
import type {
  ContractRotationRecord,
  ContractsProgressRepository,
  ContractsRotationRepository,
} from "../../application/ports";
import type { ContractCadence } from "../../domain/types";
import type { ContractProgress } from "../../domain/progress";

const parseContractIds = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
};

const serializeContractIds = (contractIds: string[]): string => {
  return JSON.stringify(contractIds);
};

type RotationRow = {
  cadence: ContractCadence;
  period_key: string;
  contract_ids_json: string;
  reset_at: string;
  activated_at: string;
  updated_at: string;
};

const rotationRowToRecord = (row: RotationRow): ContractRotationRecord => ({
  cadence: row.cadence,
  periodKey: row.period_key,
  contractIds: parseContractIds(row.contract_ids_json),
  resetAt: new Date(row.reset_at),
  activatedAt: new Date(row.activated_at),
});

export const createSqliteContractsRotationRepository = (
  db: SqliteDatabase,
): ContractsRotationRepository => {
  const getRotation = (
    cadence: ContractCadence,
    periodKey: string,
  ): ContractRotationRecord | null => {
    const row = db
      .prepare<unknown[], RotationRow>(
        `
        SELECT cadence, period_key, contract_ids_json, reset_at, activated_at, updated_at
        FROM dice_contract_rotations
        WHERE cadence = ? AND period_key = ?
      `,
      )
      .get(cadence, periodKey);

    if (!row) {
      return null;
    }

    return rotationRowToRecord(row);
  };

  const saveRotation = (record: ContractRotationRecord): void => {
    const updatedAt = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO dice_contract_rotations (cadence, period_key, contract_ids_json, reset_at, activated_at, updated_at)
      VALUES (@cadence, @periodKey, @contractIds, @resetAt, @activatedAt, @updatedAt)
      ON CONFLICT(cadence, period_key)
      DO UPDATE SET
        contract_ids_json = excluded.contract_ids_json,
        reset_at = excluded.reset_at,
        activated_at = excluded.activated_at,
        updated_at = excluded.updated_at
    `,
    ).run({
      cadence: record.cadence,
      periodKey: record.periodKey,
      contractIds: serializeContractIds(record.contractIds),
      resetAt: record.resetAt.toISOString(),
      activatedAt: record.activatedAt.toISOString(),
      updatedAt,
    });
  };

  return { getRotation, saveRotation };
};

type ProgressRow = {
  user_id: string;
  contract_id: string;
  cadence: ContractCadence;
  period_key: string;
  objective_type: string;
  required_count: number;
  current_count: number;
  completed_at: string | null;
  rewarded_at: string | null;
  reward_pips: number;
  reward_fame: number;
  updated_at: string;
};

const rowToProgress = (row: ProgressRow): ContractProgress => ({
  contractId: row.contract_id,
  cadence: row.cadence,
  objectiveType: row.objective_type as ContractProgress["objectiveType"],
  requiredCount: row.required_count,
  currentCount: row.current_count,
  completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  rewardedAt: row.rewarded_at ? new Date(row.rewarded_at) : undefined,
  reward: {
    pips: row.reward_pips,
    fame: row.reward_fame,
  },
});

export const createSqliteContractsProgressRepository = (
  db: SqliteDatabase,
): ContractsProgressRepository => {
  const getProgress = (
    userId: string,
    contractId: string,
    cadence: ContractCadence,
    periodKey: string,
  ): ContractProgress | null => {
    const row = db
      .prepare<unknown[], ProgressRow>(
        `
        SELECT
          user_id,
          contract_id,
          cadence,
          period_key,
          objective_type,
          required_count,
          current_count,
          completed_at,
          rewarded_at,
          reward_pips,
          reward_fame,
          updated_at
        FROM dice_contract_progress
        WHERE user_id = ? AND contract_id = ? AND cadence = ? AND period_key = ?
      `,
      )
      .get(userId, contractId, cadence, periodKey);

    if (!row) {
      return null;
    }

    return rowToProgress(row);
  };

  const saveProgress = (userId: string, progress: ContractProgress, periodKey: string): void => {
    const updatedAt = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO dice_contract_progress (
        user_id,
        contract_id,
        cadence,
        period_key,
        objective_type,
        required_count,
        current_count,
        completed_at,
        rewarded_at,
        reward_pips,
        reward_fame,
        updated_at
      ) VALUES (
        @userId,
        @contractId,
        @cadence,
        @periodKey,
        @objectiveType,
        @requiredCount,
        @currentCount,
        @completedAt,
        @rewardedAt,
        @rewardPips,
        @rewardFame,
        @updatedAt
      )
      ON CONFLICT(user_id, contract_id, cadence, period_key)
      DO UPDATE SET
        objective_type = excluded.objective_type,
        required_count = excluded.required_count,
        current_count = excluded.current_count,
        completed_at = excluded.completed_at,
        rewarded_at = excluded.rewarded_at,
        reward_pips = excluded.reward_pips,
        reward_fame = excluded.reward_fame,
        updated_at = excluded.updated_at
    `,
    ).run({
      userId,
      contractId: progress.contractId,
      cadence: progress.cadence,
      periodKey,
      objectiveType: progress.objectiveType,
      requiredCount: progress.requiredCount,
      currentCount: progress.currentCount,
      completedAt: progress.completedAt?.toISOString() ?? null,
      rewardedAt: progress.rewardedAt?.toISOString() ?? null,
      rewardPips: progress.reward.pips,
      rewardFame: progress.reward.fame,
      updatedAt,
    });
  };

  return { getProgress, saveProgress };
};
