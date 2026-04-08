import type { SqliteDatabase } from "../../../../shared/db";

export type RaidTierFirstClearRecord = {
  userId: string;
  tierId: string;
  runId: string;
  clearedAt: Date;
};

type RaidTierFirstClearRow = {
  user_id: string;
  tier_id: string;
  run_id: string;
  cleared_at: string;
};

const selectFirstClearColumns = `
  user_id,
  tier_id,
  run_id,
  cleared_at
`;

const mapFirstClearRow = (row: RaidTierFirstClearRow): RaidTierFirstClearRecord => {
  return {
    userId: row.user_id,
    tierId: row.tier_id,
    runId: row.run_id,
    clearedAt: new Date(row.cleared_at),
  };
};

export const createSqliteRaidRewardStateRepository = (db: SqliteDatabase) => {
  const claimTierFirstClear = ({
    userId,
    tierId,
    runId,
    clearedAt,
  }: {
    userId: string;
    tierId: string;
    runId: string;
    clearedAt: Date;
  }): boolean => {
    const result = db
      .prepare(
        `
        INSERT OR IGNORE INTO dice_raid_tier_first_clears (
          user_id,
          tier_id,
          run_id,
          cleared_at
        )
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(userId, tierId, runId, clearedAt.toISOString());

    return result.changes === 1;
  };

  const getTierFirstClear = ({
    userId,
    tierId,
  }: {
    userId: string;
    tierId: string;
  }): RaidTierFirstClearRecord | null => {
    const row = db
      .prepare<unknown[], RaidTierFirstClearRow>(
        `
        SELECT ${selectFirstClearColumns}
        FROM dice_raid_tier_first_clears
        WHERE user_id = ? AND tier_id = ?
      `,
      )
      .get(userId, tierId);

    return row ? mapFirstClearRow(row) : null;
  };

  return {
    claimTierFirstClear,
    getTierFirstClear,
  };
};
