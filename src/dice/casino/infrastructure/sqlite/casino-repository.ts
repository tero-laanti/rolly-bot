import type { SqliteDatabase } from "../../../../shared/db";
import type {
  DiceCasinoAnalyticsCompletion,
  DiceCasinoAnalyticsRepository,
  DiceCasinoAnalyticsUpdate,
  DiceCasinoSessionRepository,
} from "../../application/ports";
import {
  createDefaultDiceCasinoSessionState,
  normalizeDiceCasinoSessionState,
  type DiceCasinoSession,
  type DiceCasinoSessionState,
} from "../../domain/casino-session";

type DiceCasinoSessionRow = {
  user_id: string;
  bet: number;
  state_json: string;
  status: string;
  expires_at: string;
  updated_at: string;
};

const parseDiceCasinoSessionState = (raw: string): DiceCasinoSessionState => {
  try {
    return normalizeDiceCasinoSessionState(JSON.parse(raw) as Partial<DiceCasinoSessionState>);
  } catch {
    return createDefaultDiceCasinoSessionState();
  }
};

const mapDiceCasinoSessionRow = (row: DiceCasinoSessionRow): DiceCasinoSession => {
  return {
    userId: row.user_id,
    bet: row.bet,
    state: parseDiceCasinoSessionState(row.state_json),
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
};

const getDiceCasinoSessionRow = (
  db: SqliteDatabase,
  userId: string,
): DiceCasinoSessionRow | undefined => {
  return db
    .prepare(
      `
      SELECT user_id, bet, state_json, status, expires_at, updated_at
      FROM dice_casino_sessions
      WHERE user_id = ?
    `,
    )
    .get(userId) as DiceCasinoSessionRow | undefined;
};

const expireDiceCasinoSession = (db: SqliteDatabase, userId: string): void => {
  db.prepare(
    `
    UPDATE dice_casino_sessions
    SET status = 'expired', updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    updatedAt: new Date().toISOString(),
  });
};

const getActiveDiceCasinoSession = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): DiceCasinoSession | null => {
  const row = getDiceCasinoSessionRow(db, userId);
  if (!row || row.status !== "active") {
    return null;
  }

  const expiresAtMs = Date.parse(row.expires_at);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= nowMs) {
    expireDiceCasinoSession(db, userId);
    return null;
  }

  return mapDiceCasinoSessionRow(row);
};

const saveDiceCasinoSession = (db: SqliteDatabase, session: DiceCasinoSession): void => {
  db.prepare(
    `
    INSERT INTO dice_casino_sessions (
      user_id,
      bet,
      game,
      state_json,
      status,
      expires_at,
      updated_at
    )
    VALUES (
      @userId,
      @bet,
      @game,
      @stateJson,
      'active',
      @expiresAt,
      @updatedAt
    )
    ON CONFLICT(user_id)
    DO UPDATE SET
      bet = excluded.bet,
      game = excluded.game,
      state_json = excluded.state_json,
      status = excluded.status,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `,
  ).run({
    userId: session.userId,
    bet: session.bet,
    game: session.state.selectedGame,
    stateJson: JSON.stringify(session.state),
    expiresAt: session.expiresAt,
    updatedAt: session.updatedAt,
  });
};

const recordDiceCasinoRoundStarted = (
  db: SqliteDatabase,
  { userId, game, betTier, wagered }: DiceCasinoAnalyticsUpdate,
): void => {
  const nowIso = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_casino_analytics (
      user_id,
      game,
      bet_tier,
      rounds_started,
      rounds_completed,
      wins,
      losses,
      pushes,
      total_wagered,
      total_paid_out,
      largest_payout,
      updated_at
    )
    VALUES (
      @userId,
      @game,
      @betTier,
      1,
      0,
      0,
      0,
      0,
      @wagered,
      0,
      0,
      @updatedAt
    )
    ON CONFLICT(user_id, game, bet_tier)
    DO UPDATE SET
      rounds_started = rounds_started + 1,
      total_wagered = total_wagered + excluded.total_wagered,
      updated_at = excluded.updated_at
  `,
  ).run({
    userId,
    game,
    betTier,
    wagered,
    updatedAt: nowIso,
  });
};

const recordDiceCasinoRoundCompleted = (
  db: SqliteDatabase,
  { userId, game, betTier, payout, outcome }: DiceCasinoAnalyticsCompletion,
): void => {
  const nowIso = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_casino_analytics (
      user_id,
      game,
      bet_tier,
      rounds_started,
      rounds_completed,
      wins,
      losses,
      pushes,
      total_wagered,
      total_paid_out,
      largest_payout,
      updated_at
    )
    VALUES (
      @userId,
      @game,
      @betTier,
      0,
      1,
      @wins,
      @losses,
      @pushes,
      0,
      @payout,
      @payout,
      @updatedAt
    )
    ON CONFLICT(user_id, game, bet_tier)
    DO UPDATE SET
      rounds_completed = rounds_completed + 1,
      wins = wins + excluded.wins,
      losses = losses + excluded.losses,
      pushes = pushes + excluded.pushes,
      total_paid_out = total_paid_out + excluded.total_paid_out,
      largest_payout = MAX(largest_payout, excluded.largest_payout),
      updated_at = excluded.updated_at
  `,
  ).run({
    userId,
    game,
    betTier,
    payout,
    wins: outcome === "win" ? 1 : 0,
    losses: outcome === "loss" ? 1 : 0,
    pushes: outcome === "push" ? 1 : 0,
    updatedAt: nowIso,
  });
};

export const createSqliteDiceCasinoSessionRepository = (
  db: SqliteDatabase,
): DiceCasinoSessionRepository => {
  return {
    getActiveSession: (userId, nowMs) => getActiveDiceCasinoSession(db, userId, nowMs),
    saveSession: (session) => saveDiceCasinoSession(db, session),
    expireSession: (userId) => expireDiceCasinoSession(db, userId),
  };
};

export const createSqliteDiceCasinoAnalyticsRepository = (
  db: SqliteDatabase,
): DiceCasinoAnalyticsRepository => {
  return {
    recordRoundStarted: (update) => recordDiceCasinoRoundStarted(db, update),
    recordRoundCompleted: (update) => recordDiceCasinoRoundCompleted(db, update),
  };
};
