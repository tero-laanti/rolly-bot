import type { SqliteDatabase } from "../../../../shared/db";
import type { DicePvpRepository } from "../../application/ports";
import {
  dicePvpOpenOpponentId,
  isDicePvpChallengeExpired,
  type DicePvpChallenge,
  type DicePvpChallengeCreateResult,
  type DicePvpChallengeStatus,
  type DicePvpEffects,
} from "../../domain/pvp";
import { normalizeDicePvpTier } from "../../domain/game-rules";

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
  wagerPips: number;
  expiresAt: string;
};

type DicePvpChallengeCreateIfAvailable = DicePvpChallengeCreate & {
  nowMs?: number;
};

type DicePvpAchievementStatsRow = {
  user_id: string;
  duels_total: number;
  current_win_streak: number;
  highest_win_streak: number;
  highest_tier_win: number;
  updated_at: string;
};

type DicePvpChallengeRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  duel_tier: number;
  wager_pips: number;
  status: string;
  created_at: string;
  expires_at: string;
  updated_at: string;
};

const mapDicePvpChallengeRow = (row: DicePvpChallengeRow): DicePvpChallenge => {
  return {
    id: row.id,
    challengerId: row.challenger_id,
    opponentId: row.opponent_id,
    duelTier: row.duel_tier,
    wagerPips: row.wager_pips,
    status: row.status as DicePvpChallengeStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
};

const getDicePvpEffects = (db: SqliteDatabase, userId: string): DicePvpEffects => {
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

const setDicePvpEffects = (
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

const getActiveDiceLockout = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): number | null => {
  return getActiveUntil(getDicePvpEffects(db, userId).lockoutUntil, nowMs);
};

const getActiveDoubleRoll = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): number | null => {
  return getActiveUntil(getDicePvpEffects(db, userId).doubleRollUntil, nowMs);
};

const createDicePvpChallenge = (
  db: SqliteDatabase,
  { id, challengerId, opponentId, duelTier, wagerPips, expiresAt }: DicePvpChallengeCreate,
): void => {
  const nowIso = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_pvp_challenges (
      id,
      challenger_id,
      opponent_id,
      duel_tier,
      wager_pips,
      status,
      created_at,
      expires_at,
      updated_at
    )
    VALUES (
      @id,
      @challengerId,
      @opponentId,
      @duelTier,
      @wagerPips,
      'pending',
      @createdAt,
      @expiresAt,
      @updatedAt
    )
  `,
  ).run({
    id,
    challengerId,
    opponentId,
    duelTier: normalizeDicePvpTier(duelTier),
    wagerPips: Math.max(0, Math.floor(wagerPips)),
    createdAt: nowIso,
    expiresAt,
    updatedAt: nowIso,
  });
};

const getDicePvpChallenge = (
  db: SqliteDatabase,
  challengeId: string,
): DicePvpChallenge | undefined => {
  const row = db
    .prepare(
      `
      SELECT
        id,
        challenger_id,
        opponent_id,
        duel_tier,
        wager_pips,
        status,
        created_at,
        expires_at,
        updated_at
      FROM dice_pvp_challenges
      WHERE id = ?
    `,
    )
    .get(challengeId) as DicePvpChallengeRow | undefined;

  return row ? mapDicePvpChallengeRow(row) : undefined;
};

const getPendingDicePvpChallengesByUser = (
  db: SqliteDatabase,
  userId: string,
): DicePvpChallenge[] => {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        challenger_id,
        opponent_id,
        duel_tier,
        wager_pips,
        status,
        created_at,
        expires_at,
        updated_at
      FROM dice_pvp_challenges
      WHERE status = 'pending' AND (challenger_id = ? OR opponent_id = ?)
      ORDER BY created_at DESC
    `,
    )
    .all(userId, userId) as DicePvpChallengeRow[];

  return rows.map(mapDicePvpChallengeRow);
};

const setDicePvpChallengeStatusFromPending = (
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

const expireExpiredPendingDicePvpChallengesForUser = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): DicePvpChallenge[] => {
  const expiredChallenges: DicePvpChallenge[] = [];

  for (const pending of getPendingDicePvpChallengesByUser(db, userId)) {
    if (!isDicePvpChallengeExpired(pending, nowMs)) {
      continue;
    }

    if (!setDicePvpChallengeStatusFromPending(db, pending.id, "expired")) {
      continue;
    }

    expiredChallenges.push({
      ...pending,
      status: "expired",
    });
  }

  return expiredChallenges;
};

const getActivePendingDicePvpChallengeForUser = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number,
): DicePvpChallenge | undefined => {
  for (const pending of getPendingDicePvpChallengesByUser(db, userId)) {
    if (isDicePvpChallengeExpired(pending, nowMs)) {
      continue;
    }

    if (hasLockedParticipant(db, pending, nowMs)) {
      continue;
    }

    return pending;
  }

  return undefined;
};

const createDicePvpChallengeIfUsersAvailable = (
  db: SqliteDatabase,
  { nowMs = Date.now(), ...challenge }: DicePvpChallengeCreateIfAvailable,
): DicePvpChallengeCreateResult => {
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
};

const setDicePvpChallengeOpponentFromOpen = (
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

const getAchievementStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DicePvpAchievementStatsRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        user_id,
        duels_total,
        current_win_streak,
        highest_win_streak,
        highest_tier_win,
        updated_at
      FROM dice_pvp_achievement_stats
      WHERE user_id = ?
    `,
    )
    .get(userId) as DicePvpAchievementStatsRow | undefined;
};

const getOrCreateAchievementStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DicePvpAchievementStatsRow => {
  const existing = getAchievementStatsRow(db, userId);
  if (existing) {
    return existing;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_pvp_achievement_stats (
      user_id,
      duels_total,
      current_win_streak,
      highest_win_streak,
      highest_tier_win,
      updated_at
    )
    VALUES (@userId, 0, 0, 0, 0, @updatedAt)
    ON CONFLICT(user_id)
    DO NOTHING
  `,
  ).run({
    userId,
    updatedAt,
  });

  const created = getAchievementStatsRow(db, userId);
  if (!created) {
    throw new Error(`Failed to initialize PvP achievement stats for user ${userId}`);
  }

  return created;
};

const mapAchievementStats = (row: DicePvpAchievementStatsRow) => {
  return {
    duelsTotal: row.duels_total,
    currentWinStreak: row.current_win_streak,
    highestWinStreak: row.highest_win_streak,
    highestTierWin: row.highest_tier_win,
  };
};

const getDicePvpAchievementStats = (db: SqliteDatabase, userId: string) => {
  return mapAchievementStats(getOrCreateAchievementStatsRow(db, userId));
};

const recordResolvedDuel = (
  db: SqliteDatabase,
  {
    userId,
    duelTier,
    result,
  }: {
    userId: string;
    duelTier: number;
    result: "win" | "loss" | "draw";
  },
) => {
  const stats = getOrCreateAchievementStatsRow(db, userId);
  const nextCurrentWinStreak = result === "win" ? stats.current_win_streak + 1 : 0;
  const nextHighestWinStreak = Math.max(stats.highest_win_streak, nextCurrentWinStreak);
  const nextHighestTierWin =
    result === "win"
      ? Math.max(stats.highest_tier_win, normalizeDicePvpTier(duelTier))
      : stats.highest_tier_win;
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_pvp_achievement_stats
    SET
      duels_total = @duelsTotal,
      current_win_streak = @currentWinStreak,
      highest_win_streak = @highestWinStreak,
      highest_tier_win = @highestTierWin,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    duelsTotal: stats.duels_total + 1,
    currentWinStreak: nextCurrentWinStreak,
    highestWinStreak: nextHighestWinStreak,
    highestTierWin: nextHighestTierWin,
    updatedAt,
  });

  return {
    duelsTotal: stats.duels_total + 1,
    currentWinStreak: nextCurrentWinStreak,
    highestWinStreak: nextHighestWinStreak,
    highestTierWin: nextHighestTierWin,
  };
};

export const createSqlitePvpRepository = (db: SqliteDatabase): DicePvpRepository => {
  return {
    getDicePvpEffects: (userId) => getDicePvpEffects(db, userId),
    setDicePvpEffects: (update) => setDicePvpEffects(db, update),
    getActiveDiceLockout: (userId, nowMs) => getActiveDiceLockout(db, userId, nowMs),
    getActiveDoubleRoll: (userId, nowMs) => getActiveDoubleRoll(db, userId, nowMs),
    createDicePvpChallengeIfUsersAvailable: (challenge) =>
      createDicePvpChallengeIfUsersAvailable(db, challenge),
    expireExpiredPendingDicePvpChallengesForUser: (userId, nowMs) =>
      expireExpiredPendingDicePvpChallengesForUser(db, userId, nowMs),
    getDicePvpChallenge: (challengeId) => getDicePvpChallenge(db, challengeId),
    setDicePvpChallengeOpponentFromOpen: (challengeId, opponentId) =>
      setDicePvpChallengeOpponentFromOpen(db, challengeId, opponentId),
    setDicePvpChallengeStatusFromPending: (challengeId, status) =>
      setDicePvpChallengeStatusFromPending(db, challengeId, status),
    getDicePvpAchievementStats: (userId) => getDicePvpAchievementStats(db, userId),
    recordResolvedDuel: (update) => recordResolvedDuel(db, update),
  };
};
