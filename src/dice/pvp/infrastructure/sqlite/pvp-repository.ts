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
  expiresAt: string;
};

type DicePvpChallengeCreateIfAvailable = DicePvpChallengeCreate & {
  nowMs?: number;
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
  { id, challengerId, opponentId, duelTier, expiresAt }: DicePvpChallengeCreate,
): void => {
  const nowIso = new Date().toISOString();

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
      SELECT id, challenger_id, opponent_id, duel_tier, status, created_at, expires_at, updated_at
      FROM dice_pvp_challenges
      WHERE id = ?
    `,
    )
    .get(challengeId) as DicePvpChallengeRow | undefined;

  return row ? mapDicePvpChallengeRow(row) : undefined;
};

const getPendingDicePvpChallengeByUser = (
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

const createDicePvpChallengeIfUsersAvailable = (
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

export const createSqlitePvpRepository = (db: SqliteDatabase): DicePvpRepository => {
  return {
    getDicePvpEffects: (userId) => getDicePvpEffects(db, userId),
    setDicePvpEffects: (update) => setDicePvpEffects(db, update),
    getActiveDiceLockout: (userId, nowMs) => getActiveDiceLockout(db, userId, nowMs),
    getActiveDoubleRoll: (userId, nowMs) => getActiveDoubleRoll(db, userId, nowMs),
    createDicePvpChallengeIfUsersAvailable: (challenge) =>
      createDicePvpChallengeIfUsersAvailable(db, challenge),
    getDicePvpChallenge: (challengeId) => getDicePvpChallenge(db, challengeId),
    setDicePvpChallengeOpponentFromOpen: (challengeId, opponentId) =>
      setDicePvpChallengeOpponentFromOpen(db, challengeId, opponentId),
    setDicePvpChallengeStatusFromPending: (challengeId, status) =>
      setDicePvpChallengeStatusFromPending(db, challengeId, status),
  };
};
