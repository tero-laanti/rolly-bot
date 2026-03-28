import type { SqliteDatabase } from "../../../../shared/db";

export type ContractMasterCadence = "daily" | "weekly";
export type ContractMasterDifficulty = "simple" | "serious" | "brutal";
export type ContractMasterAcceptedVia = "initial" | "reroll" | "refill";

export type ContractMasterInitialOfferRecord = {
  cadence: ContractMasterCadence;
  difficulty: ContractMasterDifficulty;
  resetWindow: string;
  contractId: string;
  createdAt: Date;
};

export type ContractMasterUserCadenceStateRecord = {
  userId: string;
  cadence: ContractMasterCadence;
  resetWindow: string;
  completionCount: number;
  refillAvailableDifficulty?: ContractMasterDifficulty;
  refillClaimedAt?: Date;
  lastCompletedAt?: Date;
};

export type ContractMasterRunRecord = {
  userId: string;
  cadence: ContractMasterCadence;
  resetWindow: string;
  sequenceNumber: number;
  contractId: string;
  difficulty: ContractMasterDifficulty;
  objectiveType: string;
  requiredCount: number;
  currentCount: number;
  acceptedVia: ContractMasterAcceptedVia;
  acceptedAt: Date;
  completedAt?: Date;
  rewardPips: number;
  rewardGrantedAt?: Date;
};

export type ContractMasterRerollUsageRecord = {
  userId: string;
  cadence: ContractMasterCadence;
  resetWindow: string;
  difficulty: ContractMasterDifficulty;
  usedAt: Date;
};

type InitialOfferRow = {
  cadence: ContractMasterCadence;
  difficulty: ContractMasterDifficulty;
  reset_window: string;
  contract_id: string;
  created_at: string;
  updated_at: string;
};

type UserCadenceStateRow = {
  user_id: string;
  cadence: ContractMasterCadence;
  reset_window: string;
  completion_count: number;
  refill_available_difficulty: ContractMasterDifficulty | null;
  refill_claimed_at: string | null;
  last_completed_at: string | null;
  updated_at: string;
};

type RunRow = {
  user_id: string;
  cadence: ContractMasterCadence;
  reset_window: string;
  sequence_number: number;
  contract_id: string;
  difficulty: ContractMasterDifficulty;
  objective_type: string;
  required_count: number;
  current_count: number;
  accepted_via: ContractMasterAcceptedVia;
  accepted_at: string;
  completed_at: string | null;
  reward_pips: number;
  reward_granted_at: string | null;
  updated_at: string;
};

type RerollUsageRow = {
  user_id: string;
  cadence: ContractMasterCadence;
  reset_window: string;
  difficulty: ContractMasterDifficulty;
  used_at: string;
  updated_at: string;
};

const toDate = (value: string | null): Date | undefined => {
  if (value === null) {
    return undefined;
  }

  return new Date(value);
};

const initialOfferRowToRecord = (row: InitialOfferRow): ContractMasterInitialOfferRecord => ({
  cadence: row.cadence,
  difficulty: row.difficulty,
  resetWindow: row.reset_window,
  contractId: row.contract_id,
  createdAt: new Date(row.created_at),
});

const userCadenceStateRowToRecord = (
  row: UserCadenceStateRow,
): ContractMasterUserCadenceStateRecord => ({
  userId: row.user_id,
  cadence: row.cadence,
  resetWindow: row.reset_window,
  completionCount: row.completion_count,
  refillAvailableDifficulty: row.refill_available_difficulty ?? undefined,
  refillClaimedAt: toDate(row.refill_claimed_at),
  lastCompletedAt: toDate(row.last_completed_at),
});

const runRowToRecord = (row: RunRow): ContractMasterRunRecord => ({
  userId: row.user_id,
  cadence: row.cadence,
  resetWindow: row.reset_window,
  sequenceNumber: row.sequence_number,
  contractId: row.contract_id,
  difficulty: row.difficulty,
  objectiveType: row.objective_type,
  requiredCount: row.required_count,
  currentCount: row.current_count,
  acceptedVia: row.accepted_via,
  acceptedAt: new Date(row.accepted_at),
  completedAt: toDate(row.completed_at),
  rewardPips: row.reward_pips,
  rewardGrantedAt: toDate(row.reward_granted_at),
});

const rerollUsageRowToRecord = (row: RerollUsageRow): ContractMasterRerollUsageRecord => ({
  userId: row.user_id,
  cadence: row.cadence,
  resetWindow: row.reset_window,
  difficulty: row.difficulty,
  usedAt: new Date(row.used_at),
});

export const createSqliteContractMasterInitialOfferRepository = (db: SqliteDatabase) => {
  const getOffer = (
    cadence: ContractMasterCadence,
    difficulty: ContractMasterDifficulty,
    resetWindow: string,
  ): ContractMasterInitialOfferRecord | null => {
    const row = db
      .prepare<unknown[], InitialOfferRow>(
        `
        SELECT cadence, difficulty, reset_window, contract_id, created_at, updated_at
        FROM dice_contract_master_initial_offers
        WHERE cadence = ? AND difficulty = ? AND reset_window = ?
      `,
      )
      .get(cadence, difficulty, resetWindow);

    if (!row) {
      return null;
    }

    return initialOfferRowToRecord(row);
  };

  const listOffers = (
    cadence: ContractMasterCadence,
    resetWindow: string,
  ): ContractMasterInitialOfferRecord[] => {
    const rows = db
      .prepare<unknown[], InitialOfferRow>(
        `
        SELECT cadence, difficulty, reset_window, contract_id, created_at, updated_at
        FROM dice_contract_master_initial_offers
        WHERE cadence = ? AND reset_window = ?
        ORDER BY
          CASE difficulty
            WHEN 'simple' THEN 1
            WHEN 'serious' THEN 2
            WHEN 'brutal' THEN 3
            ELSE 99
          END
      `,
      )
      .all(cadence, resetWindow);

    return rows.map(initialOfferRowToRecord);
  };

  const saveOffer = (record: ContractMasterInitialOfferRecord): void => {
    const updatedAt = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO dice_contract_master_initial_offers (
        cadence,
        difficulty,
        reset_window,
        contract_id,
        created_at,
        updated_at
      ) VALUES (
        @cadence,
        @difficulty,
        @resetWindow,
        @contractId,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(cadence, difficulty, reset_window)
      DO UPDATE SET
        contract_id = excluded.contract_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `,
    ).run({
      cadence: record.cadence,
      difficulty: record.difficulty,
      resetWindow: record.resetWindow,
      contractId: record.contractId,
      createdAt: record.createdAt.toISOString(),
      updatedAt,
    });
  };

  return { getOffer, listOffers, saveOffer };
};

export const createSqliteContractMasterUserCadenceStateRepository = (db: SqliteDatabase) => {
  const getState = (
    userId: string,
    cadence: ContractMasterCadence,
    resetWindow: string,
  ): ContractMasterUserCadenceStateRecord | null => {
    const row = db
      .prepare<unknown[], UserCadenceStateRow>(
        `
        SELECT
          user_id,
          cadence,
          reset_window,
          completion_count,
          refill_available_difficulty,
          refill_claimed_at,
          last_completed_at,
          updated_at
        FROM dice_contract_master_user_cadence_state
        WHERE user_id = ? AND cadence = ? AND reset_window = ?
      `,
      )
      .get(userId, cadence, resetWindow);

    if (!row) {
      return null;
    }

    return userCadenceStateRowToRecord(row);
  };

  const saveState = (record: ContractMasterUserCadenceStateRecord): void => {
    const updatedAt = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO dice_contract_master_user_cadence_state (
        user_id,
        cadence,
        reset_window,
        completion_count,
        refill_available_difficulty,
        refill_claimed_at,
        last_completed_at,
        updated_at
      ) VALUES (
        @userId,
        @cadence,
        @resetWindow,
        @completionCount,
        @refillAvailableDifficulty,
        @refillClaimedAt,
        @lastCompletedAt,
        @updatedAt
      )
      ON CONFLICT(user_id, cadence, reset_window)
      DO UPDATE SET
        completion_count = excluded.completion_count,
        refill_available_difficulty = excluded.refill_available_difficulty,
        refill_claimed_at = excluded.refill_claimed_at,
        last_completed_at = excluded.last_completed_at,
        updated_at = excluded.updated_at
    `,
    ).run({
      userId: record.userId,
      cadence: record.cadence,
      resetWindow: record.resetWindow,
      completionCount: record.completionCount,
      refillAvailableDifficulty: record.refillAvailableDifficulty ?? null,
      refillClaimedAt: record.refillClaimedAt?.toISOString() ?? null,
      lastCompletedAt: record.lastCompletedAt?.toISOString() ?? null,
      updatedAt,
    });
  };

  return { getState, saveState };
};

export const createSqliteContractMasterRunRepository = (db: SqliteDatabase) => {
  const getRun = (
    userId: string,
    cadence: ContractMasterCadence,
    resetWindow: string,
    sequenceNumber: number,
  ): ContractMasterRunRecord | null => {
    const row = db
      .prepare<unknown[], RunRow>(
        `
        SELECT
          user_id,
          cadence,
          reset_window,
          sequence_number,
          contract_id,
          difficulty,
          objective_type,
          required_count,
          current_count,
          accepted_via,
          accepted_at,
          completed_at,
          reward_pips,
          reward_granted_at,
          updated_at
        FROM dice_contract_master_runs
        WHERE user_id = ? AND cadence = ? AND reset_window = ? AND sequence_number = ?
      `,
      )
      .get(userId, cadence, resetWindow, sequenceNumber);

    if (!row) {
      return null;
    }

    return runRowToRecord(row);
  };

  const listRuns = (
    userId: string,
    cadence: ContractMasterCadence,
    resetWindow: string,
  ): ContractMasterRunRecord[] => {
    const rows = db
      .prepare<unknown[], RunRow>(
        `
        SELECT
          user_id,
          cadence,
          reset_window,
          sequence_number,
          contract_id,
          difficulty,
          objective_type,
          required_count,
          current_count,
          accepted_via,
          accepted_at,
          completed_at,
          reward_pips,
          reward_granted_at,
          updated_at
        FROM dice_contract_master_runs
        WHERE user_id = ? AND cadence = ? AND reset_window = ?
        ORDER BY sequence_number
      `,
      )
      .all(userId, cadence, resetWindow);

    return rows.map(runRowToRecord);
  };

  const saveRun = (record: ContractMasterRunRecord): void => {
    const updatedAt = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO dice_contract_master_runs (
        user_id,
        cadence,
        reset_window,
        sequence_number,
        contract_id,
        difficulty,
        objective_type,
        required_count,
        current_count,
        accepted_via,
        accepted_at,
        completed_at,
        reward_pips,
        reward_granted_at,
        updated_at
      ) VALUES (
        @userId,
        @cadence,
        @resetWindow,
        @sequenceNumber,
        @contractId,
        @difficulty,
        @objectiveType,
        @requiredCount,
        @currentCount,
        @acceptedVia,
        @acceptedAt,
        @completedAt,
        @rewardPips,
        @rewardGrantedAt,
        @updatedAt
      )
      ON CONFLICT(user_id, cadence, reset_window, sequence_number)
      DO UPDATE SET
        contract_id = excluded.contract_id,
        difficulty = excluded.difficulty,
        objective_type = excluded.objective_type,
        required_count = excluded.required_count,
        current_count = excluded.current_count,
        accepted_via = excluded.accepted_via,
        accepted_at = excluded.accepted_at,
        completed_at = excluded.completed_at,
        reward_pips = excluded.reward_pips,
        reward_granted_at = excluded.reward_granted_at,
        updated_at = excluded.updated_at
    `,
    ).run({
      userId: record.userId,
      cadence: record.cadence,
      resetWindow: record.resetWindow,
      sequenceNumber: record.sequenceNumber,
      contractId: record.contractId,
      difficulty: record.difficulty,
      objectiveType: record.objectiveType,
      requiredCount: record.requiredCount,
      currentCount: record.currentCount,
      acceptedVia: record.acceptedVia,
      acceptedAt: record.acceptedAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
      rewardPips: record.rewardPips,
      rewardGrantedAt: record.rewardGrantedAt?.toISOString() ?? null,
      updatedAt,
    });
  };

  return { getRun, listRuns, saveRun };
};

export const createSqliteContractMasterRerollUsageRepository = (db: SqliteDatabase) => {
  const getUsage = (
    userId: string,
    cadence: ContractMasterCadence,
    resetWindow: string,
    difficulty: ContractMasterDifficulty,
  ): ContractMasterRerollUsageRecord | null => {
    const row = db
      .prepare<unknown[], RerollUsageRow>(
        `
        SELECT user_id, cadence, reset_window, difficulty, used_at, updated_at
        FROM dice_contract_master_reroll_usage
        WHERE user_id = ? AND cadence = ? AND reset_window = ? AND difficulty = ?
      `,
      )
      .get(userId, cadence, resetWindow, difficulty);

    if (!row) {
      return null;
    }

    return rerollUsageRowToRecord(row);
  };

  const listUsage = (
    userId: string,
    cadence: ContractMasterCadence,
    resetWindow: string,
  ): ContractMasterRerollUsageRecord[] => {
    const rows = db
      .prepare<unknown[], RerollUsageRow>(
        `
        SELECT user_id, cadence, reset_window, difficulty, used_at, updated_at
        FROM dice_contract_master_reroll_usage
        WHERE user_id = ? AND cadence = ? AND reset_window = ?
        ORDER BY
          CASE difficulty
            WHEN 'simple' THEN 1
            WHEN 'serious' THEN 2
            WHEN 'brutal' THEN 3
            ELSE 99
          END
      `,
      )
      .all(userId, cadence, resetWindow);

    return rows.map(rerollUsageRowToRecord);
  };

  const saveUsage = (record: ContractMasterRerollUsageRecord): void => {
    const updatedAt = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO dice_contract_master_reroll_usage (
        user_id,
        cadence,
        reset_window,
        difficulty,
        used_at,
        updated_at
      ) VALUES (
        @userId,
        @cadence,
        @resetWindow,
        @difficulty,
        @usedAt,
        @updatedAt
      )
      ON CONFLICT(user_id, cadence, reset_window, difficulty)
      DO UPDATE SET
        used_at = excluded.used_at,
        updated_at = excluded.updated_at
    `,
    ).run({
      userId: record.userId,
      cadence: record.cadence,
      resetWindow: record.resetWindow,
      difficulty: record.difficulty,
      usedAt: record.usedAt.toISOString(),
      updatedAt,
    });
  };

  return { getUsage, listUsage, saveUsage };
};
