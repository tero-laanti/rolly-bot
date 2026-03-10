import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceAnalyticsRepository } from "../../application/ports";
import type { DiceAnalytics } from "../../domain/analytics";
import { getMaxDicePrestige } from "../../../progression/domain/game-rules";

type DiceAnalyticsRow = {
  user_id: string;
  level_started_at: string;
  prestige_started_at: string;
  rolls_current_level: number;
  near_levelup_rolls_current_level: number;
  dice_rolled_current_prestige: number;
  total_dice_rolled: number;
  pvp_wins: number;
  pvp_losses: number;
  pvp_draws: number;
  updated_at: string;
};

type DiceRollAnalyticsUpdate = {
  userId: string;
  rollSetCount: number;
  nearLevelupRollCount: number;
  diceRolledCount: number;
};

type DicePvpStatsUpdate = {
  userId: string;
  wins?: number;
  losses?: number;
  draws?: number;
};

const normalizePrestige = (prestige: number): number => {
  return Math.min(getMaxDicePrestige(), Math.max(0, Math.floor(prestige)));
};

const getDicePrestige = (db: SqliteDatabase, userId: string): number => {
  const row = db.prepare("SELECT prestige FROM dice_prestige WHERE user_id = ?").get(userId) as
    | { prestige: number }
    | undefined;

  return normalizePrestige(row?.prestige ?? 0);
};

const setActiveDicePrestige = (db: SqliteDatabase, userId: string, prestige: number): void => {
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_active_prestige (user_id, prestige, updated_at)
    VALUES (@userId, @prestige, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
  `,
  ).run({
    userId,
    prestige,
    updatedAt,
  });
};

const getActiveDicePrestige = (db: SqliteDatabase, userId: string): number => {
  const highestPrestige = getDicePrestige(db, userId);
  const row = db
    .prepare("SELECT prestige FROM dice_active_prestige WHERE user_id = ?")
    .get(userId) as { prestige: number } | undefined;

  if (!row) {
    return highestPrestige;
  }

  const normalizedActive = Math.min(highestPrestige, normalizePrestige(row.prestige));
  if (normalizedActive !== row.prestige) {
    setActiveDicePrestige(db, userId, normalizedActive);
  }

  return normalizedActive;
};

const mapDiceAnalyticsRow = (row: DiceAnalyticsRow): DiceAnalytics => {
  return {
    levelStartedAt: row.level_started_at,
    prestigeStartedAt: row.prestige_started_at,
    rollsCurrentLevel: row.rolls_current_level,
    nearLevelupRollsCurrentLevel: row.near_levelup_rolls_current_level,
    diceRolledCurrentPrestige: row.dice_rolled_current_prestige,
    totalDiceRolled: row.total_dice_rolled,
    pvpWins: row.pvp_wins,
    pvpLosses: row.pvp_losses,
    pvpDraws: row.pvp_draws,
  };
};

const getDiceAnalyticsRow = (db: SqliteDatabase, userId: string): DiceAnalyticsRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        user_id,
        level_started_at,
        prestige_started_at,
        rolls_current_level,
        near_levelup_rolls_current_level,
        dice_rolled_current_prestige,
        total_dice_rolled,
        pvp_wins,
        pvp_losses,
        pvp_draws,
        updated_at
      FROM dice_analytics
      WHERE user_id = ?
    `,
    )
    .get(userId) as DiceAnalyticsRow | undefined;
};

const getCurrentLevelUpdatedAt = (db: SqliteDatabase, userId: string): string | null => {
  const activePrestige = getActiveDicePrestige(db, userId);
  const row = db
    .prepare("SELECT updated_at FROM dice_levels_by_prestige WHERE user_id = ? AND prestige = ?")
    .get(userId, activePrestige) as { updated_at: string } | undefined;

  return row?.updated_at ?? null;
};

const getCurrentPrestigeUpdatedAt = (db: SqliteDatabase, userId: string): string | null => {
  const row = db.prepare("SELECT updated_at FROM dice_prestige WHERE user_id = ?").get(userId) as
    | { updated_at: string }
    | undefined;

  return row?.updated_at ?? null;
};

const getOrCreateDiceAnalyticsRow = (db: SqliteDatabase, userId: string): DiceAnalyticsRow => {
  const existing = getDiceAnalyticsRow(db, userId);
  if (existing) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const levelStartedAt = getCurrentLevelUpdatedAt(db, userId) ?? nowIso;
  const prestigeStartedAt = getCurrentPrestigeUpdatedAt(db, userId) ?? nowIso;

  db.prepare(
    `
    INSERT INTO dice_analytics (
      user_id,
      level_started_at,
      prestige_started_at,
      rolls_current_level,
      near_levelup_rolls_current_level,
      dice_rolled_current_prestige,
      total_dice_rolled,
      pvp_wins,
      pvp_losses,
      pvp_draws,
      updated_at
    )
    VALUES (
      @userId,
      @levelStartedAt,
      @prestigeStartedAt,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      @updatedAt
    )
    ON CONFLICT(user_id)
    DO NOTHING
  `,
  ).run({
    userId,
    levelStartedAt,
    prestigeStartedAt,
    updatedAt: nowIso,
  });

  const created = getDiceAnalyticsRow(db, userId);
  if (!created) {
    throw new Error(`Failed to initialize dice analytics for user ${userId}`);
  }

  return created;
};

const getDiceAnalytics = (db: SqliteDatabase, userId: string): DiceAnalytics => {
  return mapDiceAnalyticsRow(getOrCreateDiceAnalyticsRow(db, userId));
};

const recordDiceRollAnalytics = (
  db: SqliteDatabase,
  { userId, rollSetCount, nearLevelupRollCount, diceRolledCount }: DiceRollAnalyticsUpdate,
): void => {
  const normalizedRollSetCount = Math.max(0, Math.floor(rollSetCount));
  const normalizedNearLevelupRollCount = Math.max(0, Math.floor(nearLevelupRollCount));
  const normalizedDiceRolledCount = Math.max(0, Math.floor(diceRolledCount));
  if (normalizedRollSetCount < 1 && normalizedDiceRolledCount < 1) {
    return;
  }

  const analytics = getOrCreateDiceAnalyticsRow(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_analytics
    SET
      rolls_current_level = @rollsCurrentLevel,
      near_levelup_rolls_current_level = @nearLevelupRollsCurrentLevel,
      dice_rolled_current_prestige = @diceRolledCurrentPrestige,
      total_dice_rolled = @totalDiceRolled,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    rollsCurrentLevel: analytics.rolls_current_level + normalizedRollSetCount,
    nearLevelupRollsCurrentLevel:
      analytics.near_levelup_rolls_current_level + normalizedNearLevelupRollCount,
    diceRolledCurrentPrestige: analytics.dice_rolled_current_prestige + normalizedDiceRolledCount,
    totalDiceRolled: analytics.total_dice_rolled + normalizedDiceRolledCount,
    updatedAt,
  });
};

const resetDiceLevelAnalyticsProgress = (db: SqliteDatabase, userId: string): void => {
  getOrCreateDiceAnalyticsRow(db, userId);
  const nowIso = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_analytics
    SET
      level_started_at = @nowIso,
      rolls_current_level = 0,
      near_levelup_rolls_current_level = 0,
      updated_at = @nowIso
    WHERE user_id = @userId
  `,
  ).run({ userId, nowIso });
};

const resetDicePrestigeAnalyticsProgress = (db: SqliteDatabase, userId: string): void => {
  getOrCreateDiceAnalyticsRow(db, userId);
  const nowIso = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_analytics
    SET
      level_started_at = @nowIso,
      prestige_started_at = @nowIso,
      rolls_current_level = 0,
      near_levelup_rolls_current_level = 0,
      dice_rolled_current_prestige = 0,
      updated_at = @nowIso
    WHERE user_id = @userId
  `,
  ).run({ userId, nowIso });
};

const updateDicePvpStats = (
  db: SqliteDatabase,
  { userId, wins = 0, losses = 0, draws = 0 }: DicePvpStatsUpdate,
): void => {
  const normalizedWins = Math.max(0, Math.floor(wins));
  const normalizedLosses = Math.max(0, Math.floor(losses));
  const normalizedDraws = Math.max(0, Math.floor(draws));
  if (normalizedWins < 1 && normalizedLosses < 1 && normalizedDraws < 1) {
    return;
  }

  const analytics = getOrCreateDiceAnalyticsRow(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_analytics
    SET
      pvp_wins = @pvpWins,
      pvp_losses = @pvpLosses,
      pvp_draws = @pvpDraws,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    pvpWins: analytics.pvp_wins + normalizedWins,
    pvpLosses: analytics.pvp_losses + normalizedLosses,
    pvpDraws: analytics.pvp_draws + normalizedDraws,
    updatedAt,
  });
};

export const createSqliteAnalyticsRepository = (
  db: SqliteDatabase,
): DiceAnalyticsRepository => {
  return {
    getDiceAnalytics: (userId) => getDiceAnalytics(db, userId),
    recordDiceRollAnalytics: (update) => recordDiceRollAnalytics(db, update),
    resetDiceLevelAnalyticsProgress: (userId) => resetDiceLevelAnalyticsProgress(db, userId),
    resetDicePrestigeAnalyticsProgress: (userId) =>
      resetDicePrestigeAnalyticsProgress(db, userId),
    updateDicePvpStats: (update) => updateDicePvpStats(db, update),
  };
};
