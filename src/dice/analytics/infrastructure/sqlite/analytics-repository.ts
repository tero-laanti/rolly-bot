import type { SqliteDatabase } from "../../../../shared/db";
import type {
  DiceAnalyticsRepository,
  DicePvpStatsUpdate,
  DiceRollAnalyticsUpdate,
} from "../../application/ports";
import type { DiceAnalytics } from "../../domain/analytics";
import { getMaxDicePrestige } from "../../../progression/domain/game-rules";

type DiceAnalyticsRow = {
  user_id: string;
  dice_count_started_at: string;
  prestige_started_at: string;
  roll_sets_current_dice_count: number;
  near_dice_count_increase_roll_sets_current_dice_count: number;
  dice_rolled_current_prestige: number;
  total_dice_rolled: number;
  total_dice_sets_rolled: number;
  total_roll_commands_called: number;
  pvp_wins: number;
  pvp_losses: number;
  pvp_draws: number;
  updated_at: string;
};

type DiceAnalyticsByPrestigeRow = {
  user_id: string;
  prestige: number;
  prestige_started_at: string;
  dice_count_started_at: string;
  roll_sets_current_dice_count: number;
  near_dice_count_increase_roll_sets_current_dice_count: number;
  dice_rolled_current_prestige: number;
  updated_at: string;
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

const mapDiceAnalyticsRow = (
  row: DiceAnalyticsRow,
  prestigeRow: DiceAnalyticsByPrestigeRow,
): DiceAnalytics => {
  return {
    diceCountStartedAt: prestigeRow.dice_count_started_at,
    prestigeStartedAt: prestigeRow.prestige_started_at,
    rollSetsCurrentDiceCount: prestigeRow.roll_sets_current_dice_count,
    nearDiceCountIncreaseRollSetsCurrentDiceCount:
      prestigeRow.near_dice_count_increase_roll_sets_current_dice_count,
    diceRolledCurrentPrestige: prestigeRow.dice_rolled_current_prestige,
    totalDiceRolled: row.total_dice_rolled,
    totalDiceSetsRolled: row.total_dice_sets_rolled,
    totalRollCommandsCalled: row.total_roll_commands_called,
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
        dice_count_started_at,
        prestige_started_at,
        roll_sets_current_dice_count,
        near_dice_count_increase_roll_sets_current_dice_count,
        dice_rolled_current_prestige,
        total_dice_rolled,
        total_dice_sets_rolled,
        total_roll_commands_called,
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

const getDiceAnalyticsByPrestigeRow = (
  db: SqliteDatabase,
  userId: string,
  prestige: number,
): DiceAnalyticsByPrestigeRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        user_id,
        prestige,
        prestige_started_at,
        dice_count_started_at,
        roll_sets_current_dice_count,
        near_dice_count_increase_roll_sets_current_dice_count,
        dice_rolled_current_prestige,
        updated_at
      FROM dice_analytics_by_prestige
      WHERE user_id = ? AND prestige = ?
    `,
    )
    .get(userId, prestige) as DiceAnalyticsByPrestigeRow | undefined;
};

const getCurrentDiceCountUpdatedAt = (db: SqliteDatabase, userId: string): string | null => {
  const activePrestige = getActiveDicePrestige(db, userId);
  const row = db
    .prepare("SELECT updated_at FROM dice_counts_by_prestige WHERE user_id = ? AND prestige = ?")
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
  const diceCountStartedAt = getCurrentDiceCountUpdatedAt(db, userId) ?? nowIso;
  const prestigeStartedAt = getCurrentPrestigeUpdatedAt(db, userId) ?? nowIso;

  db.prepare(
    `
    INSERT INTO dice_analytics (
      user_id,
      dice_count_started_at,
      prestige_started_at,
      roll_sets_current_dice_count,
      near_dice_count_increase_roll_sets_current_dice_count,
      dice_rolled_current_prestige,
      total_dice_rolled,
      total_dice_sets_rolled,
      total_roll_commands_called,
      pvp_wins,
      pvp_losses,
      pvp_draws,
      updated_at
    )
    VALUES (
      @userId,
      @diceCountStartedAt,
      @prestigeStartedAt,
      0,
      0,
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
    diceCountStartedAt,
    prestigeStartedAt,
    updatedAt: nowIso,
  });

  const created = getDiceAnalyticsRow(db, userId);
  if (!created) {
    throw new Error(`Failed to initialize dice analytics for user ${userId}`);
  }

  return created;
};

const getOrCreateDiceAnalyticsByPrestigeRow = (
  db: SqliteDatabase,
  userId: string,
): DiceAnalyticsByPrestigeRow => {
  const activePrestige = getActiveDicePrestige(db, userId);
  const highestPrestige = getDicePrestige(db, userId);
  const existing = getDiceAnalyticsByPrestigeRow(db, userId, activePrestige);
  if (existing) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const diceCountStartedAt = getCurrentDiceCountUpdatedAt(db, userId) ?? nowIso;
  const prestigeStartedAt =
    activePrestige === highestPrestige
      ? (getCurrentPrestigeUpdatedAt(db, userId) ?? nowIso)
      : nowIso;

  db.prepare(
    `
    INSERT INTO dice_analytics_by_prestige (
      user_id,
      prestige,
      prestige_started_at,
      dice_count_started_at,
      roll_sets_current_dice_count,
      near_dice_count_increase_roll_sets_current_dice_count,
      dice_rolled_current_prestige,
      updated_at
    )
    VALUES (
      @userId,
      @prestige,
      @prestigeStartedAt,
      @diceCountStartedAt,
      0,
      0,
      0,
      @updatedAt
    )
    ON CONFLICT(user_id, prestige)
    DO NOTHING
  `,
  ).run({
    userId,
    prestige: activePrestige,
    prestigeStartedAt,
    diceCountStartedAt,
    updatedAt: nowIso,
  });

  const created = getDiceAnalyticsByPrestigeRow(db, userId, activePrestige);
  if (!created) {
    throw new Error(
      `Failed to initialize dice analytics for user ${userId} on prestige ${activePrestige}`,
    );
  }

  return created;
};

const getDiceAnalytics = (db: SqliteDatabase, userId: string): DiceAnalytics => {
  const analyticsRow = getOrCreateDiceAnalyticsRow(db, userId);
  const analyticsByPrestigeRow = getOrCreateDiceAnalyticsByPrestigeRow(db, userId);
  return mapDiceAnalyticsRow(analyticsRow, analyticsByPrestigeRow);
};

const recordDiceRollAnalytics = (
  db: SqliteDatabase,
  {
    userId,
    rollSetCount,
    nearDiceCountIncreaseRollCount,
    diceRolledCount,
    rollCommandCount,
  }: DiceRollAnalyticsUpdate,
): void => {
  const normalizedRollSetCount = Math.max(0, Math.floor(rollSetCount));
  const normalizedNearDiceCountIncreaseRollCount = Math.max(
    0,
    Math.floor(nearDiceCountIncreaseRollCount),
  );
  const normalizedDiceRolledCount = Math.max(0, Math.floor(diceRolledCount));
  const normalizedRollCommandCount = Math.max(0, Math.floor(rollCommandCount));
  if (
    normalizedRollSetCount < 1 &&
    normalizedDiceRolledCount < 1 &&
    normalizedRollCommandCount < 1
  ) {
    return;
  }

  const analytics = getOrCreateDiceAnalyticsRow(db, userId);
  const analyticsByPrestige = getOrCreateDiceAnalyticsByPrestigeRow(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_analytics
    SET
      dice_count_started_at = @diceCountStartedAt,
      prestige_started_at = @prestigeStartedAt,
      roll_sets_current_dice_count = @rollSetsCurrentDiceCount,
      near_dice_count_increase_roll_sets_current_dice_count = @nearDiceCountIncreaseRollSetsCurrentDiceCount,
      dice_rolled_current_prestige = @diceRolledCurrentPrestige,
      total_dice_rolled = @totalDiceRolled,
      total_dice_sets_rolled = @totalDiceSetsRolled,
      total_roll_commands_called = @totalRollCommandsCalled,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    diceCountStartedAt: analyticsByPrestige.dice_count_started_at,
    prestigeStartedAt: analyticsByPrestige.prestige_started_at,
    rollSetsCurrentDiceCount:
      analyticsByPrestige.roll_sets_current_dice_count + normalizedRollSetCount,
    nearDiceCountIncreaseRollSetsCurrentDiceCount:
      analyticsByPrestige.near_dice_count_increase_roll_sets_current_dice_count +
      normalizedNearDiceCountIncreaseRollCount,
    diceRolledCurrentPrestige:
      analyticsByPrestige.dice_rolled_current_prestige + normalizedDiceRolledCount,
    totalDiceRolled: analytics.total_dice_rolled + normalizedDiceRolledCount,
    totalDiceSetsRolled: analytics.total_dice_sets_rolled + normalizedRollSetCount,
    totalRollCommandsCalled: analytics.total_roll_commands_called + normalizedRollCommandCount,
    updatedAt,
  });

  db.prepare(
    `
    UPDATE dice_analytics_by_prestige
    SET
      roll_sets_current_dice_count = @rollSetsCurrentDiceCount,
      near_dice_count_increase_roll_sets_current_dice_count = @nearDiceCountIncreaseRollSetsCurrentDiceCount,
      dice_rolled_current_prestige = @diceRolledCurrentPrestige,
      updated_at = @updatedAt
    WHERE user_id = @userId AND prestige = @prestige
  `,
  ).run({
    userId,
    prestige: analyticsByPrestige.prestige,
    rollSetsCurrentDiceCount:
      analyticsByPrestige.roll_sets_current_dice_count + normalizedRollSetCount,
    nearDiceCountIncreaseRollSetsCurrentDiceCount:
      analyticsByPrestige.near_dice_count_increase_roll_sets_current_dice_count +
      normalizedNearDiceCountIncreaseRollCount,
    diceRolledCurrentPrestige:
      analyticsByPrestige.dice_rolled_current_prestige + normalizedDiceRolledCount,
    updatedAt,
  });
};

const resetDiceCountAnalyticsProgress = (db: SqliteDatabase, userId: string): void => {
  getOrCreateDiceAnalyticsRow(db, userId);
  const analyticsByPrestige = getOrCreateDiceAnalyticsByPrestigeRow(db, userId);
  const nowIso = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_analytics
    SET
      dice_count_started_at = @nowIso,
      roll_sets_current_dice_count = 0,
      near_dice_count_increase_roll_sets_current_dice_count = 0,
      updated_at = @nowIso
    WHERE user_id = @userId
  `,
  ).run({ userId, nowIso });

  db.prepare(
    `
    UPDATE dice_analytics_by_prestige
    SET
      prestige_started_at = @prestigeStartedAt,
      dice_count_started_at = @nowIso,
      roll_sets_current_dice_count = 0,
      near_dice_count_increase_roll_sets_current_dice_count = 0,
      dice_rolled_current_prestige = @diceRolledCurrentPrestige,
      updated_at = @nowIso
    WHERE user_id = @userId AND prestige = @prestige
  `,
  ).run({
    userId,
    prestige: analyticsByPrestige.prestige,
    prestigeStartedAt: analyticsByPrestige.prestige_started_at,
    diceRolledCurrentPrestige: analyticsByPrestige.dice_rolled_current_prestige,
    nowIso,
  });
};

const resetDicePrestigeAnalyticsProgress = (db: SqliteDatabase, userId: string): void => {
  getOrCreateDiceAnalyticsRow(db, userId);
  const analyticsByPrestige = getOrCreateDiceAnalyticsByPrestigeRow(db, userId);
  const nowIso = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_analytics
    SET
      dice_count_started_at = @nowIso,
      prestige_started_at = @nowIso,
      roll_sets_current_dice_count = 0,
      near_dice_count_increase_roll_sets_current_dice_count = 0,
      dice_rolled_current_prestige = 0,
      updated_at = @nowIso
    WHERE user_id = @userId
  `,
  ).run({ userId, nowIso });

  db.prepare(
    `
    UPDATE dice_analytics_by_prestige
    SET
      prestige_started_at = @nowIso,
      dice_count_started_at = @nowIso,
      roll_sets_current_dice_count = 0,
      near_dice_count_increase_roll_sets_current_dice_count = 0,
      dice_rolled_current_prestige = 0,
      updated_at = @nowIso
    WHERE user_id = @userId AND prestige = @prestige
  `,
  ).run({
    userId,
    prestige: analyticsByPrestige.prestige,
    nowIso,
  });
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

export const createSqliteAnalyticsRepository = (db: SqliteDatabase): DiceAnalyticsRepository => {
  return {
    getDiceAnalytics: (userId) => getDiceAnalytics(db, userId),
    recordDiceRollAnalytics: (update) => recordDiceRollAnalytics(db, update),
    resetDiceCountAnalyticsProgress: (userId) => resetDiceCountAnalyticsProgress(db, userId),
    resetDicePrestigeAnalyticsProgress: (userId) => resetDicePrestigeAnalyticsProgress(db, userId),
    updateDicePvpStats: (update) => updateDicePvpStats(db, update),
  };
};
