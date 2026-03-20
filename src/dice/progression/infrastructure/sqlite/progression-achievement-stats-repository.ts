import type { SqliteDatabase } from "../../../../shared/db";
import type {
  DiceProgressionAchievementStats,
  DiceProgressionRepository,
  RecordDiceProgressionAchievementStatsInput,
} from "../../application/ports";

type DiceProgressionAchievementStatsRow = {
  user_id: string;
  roll_commands_total: number;
  near_levelup_rolls_total: number;
  highest_charge_multiplier: number;
  highest_roll_pass_count: number;
  level_ups_total: number;
  first_ban_at: string | null;
  updated_at: string;
};

const defaultStats = (): DiceProgressionAchievementStats => {
  return {
    rollCommandsTotal: 0,
    nearLevelupRollsTotal: 0,
    highestChargeMultiplier: 1,
    highestRollPassCount: 1,
    levelUpsTotal: 0,
    firstBanAt: null,
  };
};

const mapRow = (row: DiceProgressionAchievementStatsRow): DiceProgressionAchievementStats => {
  return {
    rollCommandsTotal: row.roll_commands_total,
    nearLevelupRollsTotal: row.near_levelup_rolls_total,
    highestChargeMultiplier: row.highest_charge_multiplier,
    highestRollPassCount: row.highest_roll_pass_count,
    levelUpsTotal: row.level_ups_total,
    firstBanAt: row.first_ban_at,
  };
};

const getStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceProgressionAchievementStatsRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        user_id,
        roll_commands_total,
        near_levelup_rolls_total,
        highest_charge_multiplier,
        highest_roll_pass_count,
        level_ups_total,
        first_ban_at,
        updated_at
      FROM dice_progression_achievement_stats
      WHERE user_id = ?
    `,
    )
    .get(userId) as DiceProgressionAchievementStatsRow | undefined;
};

const getOrCreateStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceProgressionAchievementStatsRow => {
  const existing = getStatsRow(db, userId);
  if (existing) {
    return existing;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_progression_achievement_stats (
      user_id,
      roll_commands_total,
      near_levelup_rolls_total,
      highest_charge_multiplier,
      highest_roll_pass_count,
      level_ups_total,
      first_ban_at,
      updated_at
    )
    VALUES (@userId, 0, 0, 1, 1, 0, NULL, @updatedAt)
    ON CONFLICT(user_id)
    DO NOTHING
  `,
  ).run({ userId, updatedAt });

  return (
    getStatsRow(db, userId) ?? {
      user_id: userId,
      roll_commands_total: 0,
      near_levelup_rolls_total: 0,
      highest_charge_multiplier: 1,
      highest_roll_pass_count: 1,
      level_ups_total: 0,
      first_ban_at: null,
      updated_at: updatedAt,
    }
  );
};

const getDiceProgressionAchievementStats = (
  db: SqliteDatabase,
  userId: string,
): DiceProgressionAchievementStats => {
  const row = getOrCreateStatsRow(db, userId);
  return row ? mapRow(row) : defaultStats();
};

const recordDiceProgressionAchievementStats = (
  db: SqliteDatabase,
  {
    userId,
    nearLevelupRollCount,
    chargeMultiplier,
    rollPassCount,
    levelUpsGained,
  }: RecordDiceProgressionAchievementStatsInput,
): DiceProgressionAchievementStats => {
  const stats = getOrCreateStatsRow(db, userId);
  const updatedAt = new Date().toISOString();
  const nextStats: DiceProgressionAchievementStats = {
    rollCommandsTotal: stats.roll_commands_total + 1,
    nearLevelupRollsTotal:
      stats.near_levelup_rolls_total + Math.max(0, Math.floor(nearLevelupRollCount)),
    highestChargeMultiplier: Math.max(
      stats.highest_charge_multiplier,
      Math.max(1, Math.floor(chargeMultiplier)),
    ),
    highestRollPassCount: Math.max(
      stats.highest_roll_pass_count,
      Math.max(1, Math.floor(rollPassCount)),
    ),
    levelUpsTotal: stats.level_ups_total + Math.max(0, Math.floor(levelUpsGained)),
    firstBanAt: stats.first_ban_at,
  };

  db.prepare(
    `
    UPDATE dice_progression_achievement_stats
    SET
      roll_commands_total = @rollCommandsTotal,
      near_levelup_rolls_total = @nearLevelupRollsTotal,
      highest_charge_multiplier = @highestChargeMultiplier,
      highest_roll_pass_count = @highestRollPassCount,
      level_ups_total = @levelUpsTotal,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    ...nextStats,
    updatedAt,
  });

  return nextStats;
};

const markFirstDiceBan = (db: SqliteDatabase, userId: string): boolean => {
  const stats = getOrCreateStatsRow(db, userId);
  if (stats.first_ban_at) {
    return false;
  }

  const firstBanAt = new Date().toISOString();
  db.prepare(
    `
    UPDATE dice_progression_achievement_stats
    SET first_ban_at = @firstBanAt, updated_at = @firstBanAt
    WHERE user_id = @userId AND first_ban_at IS NULL
  `,
  ).run({
    userId,
    firstBanAt,
  });

  const refreshed = getStatsRow(db, userId);
  return refreshed?.first_ban_at === firstBanAt;
};

export const createSqliteProgressionAchievementStatsRepository = (
  db: SqliteDatabase,
): Pick<
  DiceProgressionRepository,
  | "getDiceProgressionAchievementStats"
  | "recordDiceProgressionAchievementStats"
  | "markFirstDiceBan"
> => {
  return {
    getDiceProgressionAchievementStats: (userId) => getDiceProgressionAchievementStats(db, userId),
    recordDiceProgressionAchievementStats: (input) =>
      recordDiceProgressionAchievementStats(db, input),
    markFirstDiceBan: (userId) => markFirstDiceBan(db, userId),
  };
};
