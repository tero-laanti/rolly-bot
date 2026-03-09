import type { SqliteDatabase } from "../../shared/db";
import { getFame } from "../../shared/economy";
import { getDiceBalanceData } from "../../rolly-data/load";
import {
  createRollContext,
  diceAchievements,
  getDiceAchievement,
  type DiceAchievementId,
} from "./achievements";

type DiceLevelUpdate = {
  userId: string;
  level: number;
};

type DiceLevelByPrestigeUpdate = {
  userId: string;
  prestige: number;
  level: number;
};

type DiceBanUpdate = {
  userId: string;
  dieIndex: number;
  bannedValue: number;
};

type DicePrestigeUpdate = {
  userId: string;
  prestige: number;
};

type DiceActivePrestigeUpdate = {
  userId: string;
  prestige: number;
};

type DicePvpEffectsUpdate = {
  userId: string;
  lockoutUntil?: string | null;
  doubleRollUntil?: string | null;
};

type DicePvpChallengeCreate = {
  id: string;
  challengerId: string;
  opponentId: string;
  duelTier: number;
  expiresAt: string;
};

type DicePvpChallengeCreateIfAvailable = DicePvpChallengeCreate & {
  nowMs?: number;
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

export type DicePvpChallengeStatus = "pending" | "declined" | "expired" | "resolved" | "cancelled";

export type DicePvpEffects = {
  lockoutUntil: string | null;
  doubleRollUntil: string | null;
};

export type DicePvpChallenge = {
  id: string;
  challengerId: string;
  opponentId: string;
  duelTier: number;
  status: DicePvpChallengeStatus;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
};

export type DicePvpChallengeCreateConflict = "challenger-has-pending" | "opponent-has-pending";

export type DicePvpChallengeCreateResult =
  | { created: true }
  | {
      created: false;
      conflict: DicePvpChallengeCreateConflict;
      challenge: DicePvpChallenge;
    };

export type DiceAnalytics = {
  levelStartedAt: string;
  prestigeStartedAt: string;
  rollsCurrentLevel: number;
  nearLevelupRollsCurrentLevel: number;
  diceRolledCurrentPrestige: number;
  totalDiceRolled: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
};

const minuteMs = 60_000;

const getDicePrestigeSides = (): number[] => {
  return getDiceBalanceData().prestigeSides;
};

export const getMaxDicePrestige = (): number => {
  return getDicePrestigeSides().length - 1;
};

export const getMaxDicePvpTier = (): number => {
  return getDiceBalanceData().pvp.maxTier;
};

export const getDicePvpChallengeExpireMs = (): number => {
  return getDiceBalanceData().pvp.challengeExpireMinutes * minuteMs;
};

export const dicePvpOpenOpponentId = "__open__";

export const getDicePrestigeBaseLevel = (): number => {
  return getDiceBalanceData().lowerPrestigeBaseLevel;
};

export const getDiceLevelUpReward = (): number => {
  return getDiceBalanceData().levelUpReward;
};

export const getDiceMaxRollPassCount = (): number => {
  return getDiceBalanceData().maxRollPassCount;
};

const getBanStep = (): number => {
  return getDiceBalanceData().banStep;
};

const getDiceChargeStartMs = (): number => {
  return getDiceBalanceData().charge.startAfterMinutes * minuteMs;
};

const getDiceChargeMaxMultiplier = (): number => {
  return getDiceBalanceData().charge.maxMultiplier;
};

const getDuelPunishmentBaseMs = (): number => {
  return getDiceBalanceData().pvp.loserLockoutBaseMinutes * minuteMs;
};

const getDuelRewardBaseMs = (): number => {
  return getDiceBalanceData().pvp.winnerBuffBaseMinutes * minuteMs;
};

export const getDiceLevel = (db: SqliteDatabase, userId: string): number => {
  const activePrestige = getActiveDicePrestige(db, userId);
  return getDiceLevelForPrestige(db, userId, activePrestige);
};

export const getDiceLevelForPrestige = (
  db: SqliteDatabase,
  userId: string,
  prestige: number,
): number => {
  const normalizedPrestige = normalizePrestige(prestige);
  const highestPrestige = getDicePrestige(db, userId);
  const row = db
    .prepare("SELECT level FROM dice_levels_by_prestige WHERE user_id = ? AND prestige = ?")
    .get(userId, normalizedPrestige) as { level: number } | undefined;
  if (row) {
    const normalizedLevel = normalizeLevel(row.level);
    if (normalizedPrestige < highestPrestige && normalizedLevel < getDicePrestigeBaseLevel()) {
      setDiceLevelForPrestige(db, {
        userId,
        prestige: normalizedPrestige,
        level: getDicePrestigeBaseLevel(),
      });
      return getDicePrestigeBaseLevel();
    }

    return normalizedLevel;
  }

  const initialLevel = normalizedPrestige === highestPrestige ? 1 : getDicePrestigeBaseLevel();

  setDiceLevelForPrestige(db, {
    userId,
    prestige: normalizedPrestige,
    level: initialLevel,
  });
  return initialLevel;
};

export const setDiceLevel = (db: SqliteDatabase, { userId, level }: DiceLevelUpdate): void => {
  const activePrestige = getActiveDicePrestige(db, userId);
  setDiceLevelForPrestige(db, { userId, prestige: activePrestige, level });
};

export const setDiceLevelForPrestige = (
  db: SqliteDatabase,
  { userId, prestige, level }: DiceLevelByPrestigeUpdate,
): void => {
  const normalizedPrestige = normalizePrestige(prestige);
  const normalizedLevel = normalizeLevel(level);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_levels_by_prestige (user_id, prestige, level, updated_at)
    VALUES (@userId, @prestige, @level, @updatedAt)
    ON CONFLICT(user_id, prestige)
    DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at
  `,
  ).run({ userId, prestige: normalizedPrestige, level: normalizedLevel, updatedAt });
};

export const getDicePrestige = (db: SqliteDatabase, userId: string): number => {
  const row = db.prepare("SELECT prestige FROM dice_prestige WHERE user_id = ?").get(userId) as
    | { prestige: number }
    | undefined;

  return normalizePrestige(row?.prestige ?? 0);
};

export const setDicePrestige = (
  db: SqliteDatabase,
  { userId, prestige }: DicePrestigeUpdate,
): void => {
  const normalizedPrestige = normalizePrestige(prestige);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_prestige (user_id, prestige, updated_at)
    VALUES (@userId, @prestige, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
  `,
  ).run({ userId, prestige: normalizedPrestige, updatedAt });
};

export const getActiveDicePrestige = (db: SqliteDatabase, userId: string): number => {
  const highestPrestige = getDicePrestige(db, userId);
  const row = db
    .prepare("SELECT prestige FROM dice_active_prestige WHERE user_id = ?")
    .get(userId) as { prestige: number } | undefined;

  if (!row) {
    return highestPrestige;
  }

  const normalizedActive = normalizeActivePrestige(row.prestige, highestPrestige);
  if (normalizedActive !== row.prestige) {
    setActiveDicePrestige(db, { userId, prestige: normalizedActive });
  }

  return normalizedActive;
};

export const setActiveDicePrestige = (
  db: SqliteDatabase,
  { userId, prestige }: DiceActivePrestigeUpdate,
): void => {
  const highestPrestige = getDicePrestige(db, userId);
  const normalizedActive = normalizeActivePrestige(prestige, highestPrestige);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_active_prestige (user_id, prestige, updated_at)
    VALUES (@userId, @prestige, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
  `,
  ).run({ userId, prestige: normalizedActive, updatedAt });
};

export const isOnHighestDicePrestige = (db: SqliteDatabase, userId: string): boolean => {
  return getActiveDicePrestige(db, userId) === getDicePrestige(db, userId);
};

export const getDiceAnalytics = (db: SqliteDatabase, userId: string): DiceAnalytics => {
  const row = getOrCreateDiceAnalyticsRow(db, userId);
  return mapDiceAnalyticsRow(row);
};

export const recordDiceRollAnalytics = (
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

export const resetDiceLevelAnalyticsProgress = (db: SqliteDatabase, userId: string): void => {
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

export const resetDicePrestigeAnalyticsProgress = (db: SqliteDatabase, userId: string): void => {
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

export const updateDicePvpStats = (
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

export const getDiceSidesForPrestige = (prestige: number): number => {
  const prestigeSides = getDicePrestigeSides();
  const normalized = Math.min(Math.max(0, Math.floor(prestige)), getMaxDicePrestige());
  return prestigeSides[normalized] ?? prestigeSides[0] ?? 6;
};

export const getDiceSides = (db: SqliteDatabase, userId: string): number => {
  return getDiceSidesForPrestige(getActiveDicePrestige(db, userId));
};

export const getUnlockedDicePvpTierFromPrestige = (prestige: number): number => {
  const normalizedPrestige = Math.max(0, Math.floor(prestige));
  return Math.min(getMaxDicePvpTier(), normalizedPrestige + 1);
};

export const getUnlockedDicePvpTier = (db: SqliteDatabase, userId: string): number => {
  return getUnlockedDicePvpTierFromPrestige(getDicePrestige(db, userId));
};

export const getBaseRollPassCount = (prestige: number): number => {
  const normalizedPrestige = Math.max(0, Math.floor(prestige));
  return normalizedPrestige + 1;
};

export const getDoubleBuffRollPassCount = (prestige: number): number => {
  return getBaseRollPassCount(prestige) * 2;
};

export const getLastDiceRollAt = (db: SqliteDatabase): number | null => {
  const row = db.prepare("SELECT last_roll_at FROM dice_charge_state WHERE id = 1").get() as
    | { last_roll_at: string }
    | undefined;

  if (!row) {
    return null;
  }

  const parsed = Date.parse(row.last_roll_at);
  return Number.isNaN(parsed) ? null : parsed;
};

export const setLastDiceRollAt = (db: SqliteDatabase, nowMs: number): void => {
  const lastRollAt = new Date(nowMs).toISOString();
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_charge_state (id, last_roll_at, updated_at)
    VALUES (1, @lastRollAt, @updatedAt)
    ON CONFLICT(id)
    DO UPDATE SET last_roll_at = excluded.last_roll_at, updated_at = excluded.updated_at
  `,
  ).run({ lastRollAt, updatedAt });
};

export const getDiceChargeMultiplier = (
  lastRollAtMs: number | null,
  nowMs: number = Date.now(),
): number => {
  if (lastRollAtMs === null) {
    return 1;
  }

  const elapsedMs = Math.max(0, nowMs - lastRollAtMs);
  const diceChargeStartMs = getDiceChargeStartMs();
  if (elapsedMs < diceChargeStartMs + minuteMs) {
    return 1;
  }

  const elapsedChargeMinutes = Math.floor((elapsedMs - diceChargeStartMs) / minuteMs);
  return Math.min(getDiceChargeMaxMultiplier(), Math.max(1, elapsedChargeMinutes));
};

export const rollDieWithBans = (bannedValues: Set<number> | null, dieSides: number): number => {
  const options: number[] = [];
  for (let value = 1; value <= dieSides; value += 1) {
    if (!bannedValues || !bannedValues.has(value)) {
      options.push(value);
    }
  }

  if (options.length === 0) {
    return Math.floor(Math.random() * dieSides) + 1;
  }

  const index = Math.floor(Math.random() * options.length);
  return options[index];
};

export const getMaxBansPerDie = (dieSides: number): number => {
  return Math.max(0, Math.floor(dieSides) - 1);
};

export const getUnlockedBanSlotsFromFame = (
  fame: number,
  _level: number,
  _dieSides: number,
): number => {
  void _level;
  void _dieSides;
  return Math.max(0, Math.floor(fame / getBanStep()));
};

export const getUnlockedBanSlots = (db: SqliteDatabase, userId: string): number => {
  const fame = getFame(db, userId);
  const level = getDiceLevel(db, userId);
  const dieSides = getDiceSides(db, userId);
  return getUnlockedBanSlotsFromFame(fame, level, dieSides);
};

export const getDiceBans = (db: SqliteDatabase, userId: string): Map<number, Set<number>> => {
  const rows = db
    .prepare("SELECT die_index, banned_value FROM dice_bans WHERE user_id = ? ORDER BY die_index")
    .all(userId) as { die_index: number; banned_value: number }[];

  const bans = new Map<number, Set<number>>();
  for (const row of rows) {
    const current = bans.get(row.die_index);
    if (current) {
      current.add(row.banned_value);
    } else {
      bans.set(row.die_index, new Set([row.banned_value]));
    }
  }

  return bans;
};

export const setDiceBan = (
  db: SqliteDatabase,
  { userId, dieIndex, bannedValue }: DiceBanUpdate,
): void => {
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_bans (user_id, die_index, banned_value, updated_at)
    VALUES (@userId, @dieIndex, @bannedValue, @updatedAt)
    ON CONFLICT(user_id, die_index, banned_value)
    DO UPDATE SET updated_at = excluded.updated_at
  `,
  ).run({ userId, dieIndex, bannedValue, updatedAt });
};

export const clearSingleDiceBan = (
  db: SqliteDatabase,
  userId: string,
  dieIndex: number,
  bannedValue: number,
): void => {
  db.prepare("DELETE FROM dice_bans WHERE user_id = ? AND die_index = ? AND banned_value = ?").run(
    userId,
    dieIndex,
    bannedValue,
  );
};

export const clearDiceBan = (db: SqliteDatabase, userId: string, dieIndex: number): void => {
  db.prepare("DELETE FROM dice_bans WHERE user_id = ? AND die_index = ?").run(userId, dieIndex);
};

export const getDicePvpEffects = (db: SqliteDatabase, userId: string): DicePvpEffects => {
  const row = db
    .prepare("SELECT lockout_until, double_roll_until FROM dice_pvp_effects WHERE user_id = ?")
    .get(userId) as { lockout_until: string | null; double_roll_until: string | null } | undefined;

  if (!row) {
    return { lockoutUntil: null, doubleRollUntil: null };
  }

  return {
    lockoutUntil: row.lockout_until,
    doubleRollUntil: row.double_roll_until,
  };
};

export const setDicePvpEffects = (
  db: SqliteDatabase,
  { userId, lockoutUntil, doubleRollUntil }: DicePvpEffectsUpdate,
): void => {
  const current = getDicePvpEffects(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_pvp_effects (user_id, lockout_until, double_roll_until, updated_at)
    VALUES (@userId, @lockoutUntil, @doubleRollUntil, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET
      lockout_until = excluded.lockout_until,
      double_roll_until = excluded.double_roll_until,
      updated_at = excluded.updated_at
  `,
  ).run({
    userId,
    lockoutUntil: lockoutUntil === undefined ? current.lockoutUntil : lockoutUntil,
    doubleRollUntil: doubleRollUntil === undefined ? current.doubleRollUntil : doubleRollUntil,
    updatedAt,
  });
};

export const getActiveDiceLockout = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): number | null => {
  const { lockoutUntil } = getDicePvpEffects(db, userId);
  return getActiveUntil(lockoutUntil, nowMs);
};

export const getActiveDoubleRoll = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): number | null => {
  const { doubleRollUntil } = getDicePvpEffects(db, userId);
  return getActiveUntil(doubleRollUntil, nowMs);
};

export const normalizeDicePvpTier = (duelTier: number): number => {
  return Math.min(getMaxDicePvpTier(), Math.max(1, Math.floor(duelTier)));
};

export const getDicePvpDieSidesForTier = (duelTier: number): number => {
  const normalizedTier = normalizeDicePvpTier(duelTier);
  const prestigeSides = getDicePrestigeSides();
  return prestigeSides[normalizedTier - 1] ?? prestigeSides[0] ?? 6;
};

export const getDicePvpDieLabel = (duelTier: number): string => {
  return `D${getDicePvpDieSidesForTier(duelTier)}`;
};

export const getDuelPunishmentMs = (duelTier: number): number => {
  const normalizedTier = normalizeDicePvpTier(duelTier);
  return getDuelPunishmentBaseMs() * 2 ** (normalizedTier - 1);
};

export const getDuelRewardMs = (duelTier: number): number => {
  const normalizedTier = normalizeDicePvpTier(duelTier);
  return getDuelRewardBaseMs() * 2 ** (normalizedTier - 1);
};

export const createDicePvpChallenge = (
  db: SqliteDatabase,
  { id, challengerId, opponentId, duelTier, expiresAt }: DicePvpChallengeCreate,
): void => {
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_pvp_challenges (
      id,
      challenger_id,
      opponent_id,
      duel_tier,
      status,
      created_at,
      expires_at,
      updated_at
    )
    VALUES (@id, @challengerId, @opponentId, @duelTier, 'pending', @createdAt, @expiresAt, @updatedAt)
  `,
  ).run({
    id,
    challengerId,
    opponentId,
    duelTier: normalizeDicePvpTier(duelTier),
    createdAt: now,
    expiresAt,
    updatedAt: now,
  });
};

export const getDicePvpChallenge = (
  db: SqliteDatabase,
  challengeId: string,
): DicePvpChallenge | undefined => {
  const row = db
    .prepare(
      `
      SELECT id, challenger_id, opponent_id, duel_tier, status, created_at, expires_at, updated_at
      FROM dice_pvp_challenges
      WHERE id = ?
    `,
    )
    .get(challengeId) as DicePvpChallengeRow | undefined;

  return row ? mapDicePvpChallengeRow(row) : undefined;
};

export const getPendingDicePvpChallengeByChallenger = (
  db: SqliteDatabase,
  challengerId: string,
): DicePvpChallenge | undefined => {
  const row = db
    .prepare(
      `
      SELECT id, challenger_id, opponent_id, duel_tier, status, created_at, expires_at, updated_at
      FROM dice_pvp_challenges
      WHERE challenger_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .get(challengerId) as DicePvpChallengeRow | undefined;

  return row ? mapDicePvpChallengeRow(row) : undefined;
};

export const getPendingDicePvpChallengeBetween = (
  db: SqliteDatabase,
  firstUserId: string,
  secondUserId: string,
): DicePvpChallenge | undefined => {
  const row = db
    .prepare(
      `
      SELECT id, challenger_id, opponent_id, duel_tier, status, created_at, expires_at, updated_at
      FROM dice_pvp_challenges
      WHERE status = 'pending'
        AND (
          (challenger_id = @firstUserId AND opponent_id = @secondUserId)
          OR
          (challenger_id = @secondUserId AND opponent_id = @firstUserId)
        )
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .get({ firstUserId, secondUserId }) as DicePvpChallengeRow | undefined;

  return row ? mapDicePvpChallengeRow(row) : undefined;
};

export const getPendingDicePvpChallengeByUser = (
  db: SqliteDatabase,
  userId: string,
): DicePvpChallenge | undefined => {
  const row = db
    .prepare(
      `
      SELECT id, challenger_id, opponent_id, duel_tier, status, created_at, expires_at, updated_at
      FROM dice_pvp_challenges
      WHERE status = 'pending' AND (challenger_id = ? OR opponent_id = ?)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .get(userId, userId) as DicePvpChallengeRow | undefined;

  return row ? mapDicePvpChallengeRow(row) : undefined;
};

export const createDicePvpChallengeIfUsersAvailable = (
  db: SqliteDatabase,
  { nowMs = Date.now(), ...challenge }: DicePvpChallengeCreateIfAvailable,
): DicePvpChallengeCreateResult => {
  return db.transaction(() => {
    const challengerPending = getActivePendingDicePvpChallengeForUser(
      db,
      challenge.challengerId,
      nowMs,
    );
    if (challengerPending) {
      return {
        created: false as const,
        conflict: "challenger-has-pending" as const,
        challenge: challengerPending,
      };
    }

    if (challenge.opponentId !== dicePvpOpenOpponentId) {
      const opponentPending = getActivePendingDicePvpChallengeForUser(
        db,
        challenge.opponentId,
        nowMs,
      );
      if (opponentPending) {
        return {
          created: false as const,
          conflict: "opponent-has-pending" as const,
          challenge: opponentPending,
        };
      }
    }

    createDicePvpChallenge(db, challenge);
    return { created: true as const };
  })();
};

export const setDicePvpChallengeOpponentFromOpen = (
  db: SqliteDatabase,
  challengeId: string,
  opponentId: string,
): boolean => {
  const updatedAt = new Date().toISOString();
  const result = db
    .prepare(
      `
      UPDATE dice_pvp_challenges
      SET opponent_id = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND opponent_id = ?
    `,
    )
    .run(opponentId, updatedAt, challengeId, dicePvpOpenOpponentId);

  return result.changes > 0;
};

export const setDicePvpChallengeStatus = (
  db: SqliteDatabase,
  challengeId: string,
  status: DicePvpChallengeStatus,
): boolean => {
  const updatedAt = new Date().toISOString();
  const result = db
    .prepare("UPDATE dice_pvp_challenges SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, updatedAt, challengeId);

  return result.changes > 0;
};

export const setDicePvpChallengeStatusFromPending = (
  db: SqliteDatabase,
  challengeId: string,
  status: DicePvpChallengeStatus,
): boolean => {
  const updatedAt = new Date().toISOString();
  const result = db
    .prepare(
      "UPDATE dice_pvp_challenges SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
    )
    .run(status, updatedAt, challengeId);

  return result.changes > 0;
};

export const isDicePvpChallengeExpired = (
  challenge: DicePvpChallenge,
  nowMs: number = Date.now(),
): boolean => {
  const expiresAtMs = Date.parse(challenge.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }

  return expiresAtMs <= nowMs;
};

export const awardAchievements = (
  db: SqliteDatabase,
  userId: string,
  achievementIds: DiceAchievementId[],
): DiceAchievementId[] => {
  if (achievementIds.length === 0) {
    return [];
  }

  const earnedAt = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at)
    VALUES (@userId, @achievementId, @earnedAt)
  `);

  const newlyEarned: DiceAchievementId[] = [];
  for (const achievementId of achievementIds) {
    const result = insert.run({ userId, achievementId, earnedAt });
    if (result.changes > 0) {
      newlyEarned.push(achievementId);
    }
  }

  return newlyEarned;
};

export const getDiceAchievementsForRoll = (
  rolls: number[],
  rolledAtMs: number = Date.now(),
): DiceAchievementId[] => {
  if (rolls.length === 0) {
    return [];
  }
  const context = createRollContext(rolls, rolledAtMs);
  return diceAchievements
    .filter((achievement) => achievement.evaluate(context))
    .map((achievement) => achievement.id);
};

export const getUserDiceAchievements = (
  db: SqliteDatabase,
  userId: string,
): DiceAchievementId[] => {
  const rows = db
    .prepare(
      "SELECT achievement_id FROM user_achievements WHERE user_id = ? ORDER BY earned_at ASC",
    )
    .all(userId) as { achievement_id: string }[];

  const achievementIds: DiceAchievementId[] = [];
  for (const row of rows) {
    const achievementId = row.achievement_id as DiceAchievementId;
    if (getDiceAchievement(achievementId)) {
      achievementIds.push(achievementId);
    }
  }

  return achievementIds;
};

export const clearUserDiceAchievements = (db: SqliteDatabase, userId: string): void => {
  db.prepare("DELETE FROM user_achievements WHERE user_id = ?").run(userId);
};

export const clearUserDiceBans = (db: SqliteDatabase, userId: string): void => {
  db.prepare("DELETE FROM dice_bans WHERE user_id = ?").run(userId);
};

type DicePvpChallengeRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  duel_tier: number;
  status: string;
  created_at: string;
  expires_at: string;
  updated_at: string;
};

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

const mapDicePvpChallengeRow = (row: DicePvpChallengeRow): DicePvpChallenge => {
  return {
    id: row.id,
    challengerId: row.challenger_id,
    opponentId: row.opponent_id,
    duelTier: row.duel_tier,
    status: row.status as DicePvpChallengeStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
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

const normalizePrestige = (prestige: number): number => {
  return Math.min(getMaxDicePrestige(), Math.max(0, Math.floor(prestige)));
};

const normalizeActivePrestige = (prestige: number, highestPrestige: number): number => {
  return Math.min(normalizePrestige(highestPrestige), normalizePrestige(prestige));
};

const normalizeLevel = (level: number): number => {
  return Math.max(1, Math.floor(level));
};

const getActivePendingDicePvpChallengeForUser = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number,
): DicePvpChallenge | undefined => {
  let pending = getPendingDicePvpChallengeByUser(db, userId);
  while (pending) {
    if (isDicePvpChallengeExpired(pending, nowMs)) {
      if (!setDicePvpChallengeStatusFromPending(db, pending.id, "expired")) {
        return pending;
      }
      pending = getPendingDicePvpChallengeByUser(db, userId);
      continue;
    }

    if (hasLockedParticipant(db, pending, nowMs)) {
      if (!setDicePvpChallengeStatusFromPending(db, pending.id, "cancelled")) {
        return pending;
      }
      pending = getPendingDicePvpChallengeByUser(db, userId);
      continue;
    }

    return pending;
  }

  return undefined;
};

const hasLockedParticipant = (
  db: SqliteDatabase,
  challenge: DicePvpChallenge,
  nowMs: number,
): boolean => {
  return (
    getActiveDiceLockout(db, challenge.challengerId, nowMs) !== null ||
    getActiveDiceLockout(db, challenge.opponentId, nowMs) !== null
  );
};

const getActiveUntil = (value: string | null, nowMs: number): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || parsed <= nowMs) {
    return null;
  }

  return parsed;
};
