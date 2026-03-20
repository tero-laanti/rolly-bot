import type { SqliteDatabase } from "../../../../shared/db";
import type {
  DiceCasinoAchievementStats,
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

type DiceCasinoAchievementStatsRow = {
  user_id: string;
  rounds_completed_total: number;
  total_wagered: number;
  highest_payout: number;
  exact_face_wins: number;
  high_low_wins: number;
  push_cashouts: number;
  push_perfect_runs: number;
  blackjack_naturals: number;
  blackjack_pushes: number;
  blackjack_hit_to_21_wins: number;
  poker_straights: number;
  poker_full_houses: number;
  poker_four_of_a_kind: number;
  poker_five_of_a_kind: number;
  played_exact_roll: number;
  played_push_your_luck: number;
  played_blackjack: number;
  played_dice_poker: number;
  updated_at: string;
};

const mapAchievementStatsRow = (row: DiceCasinoAchievementStatsRow): DiceCasinoAchievementStats => {
  return {
    roundsCompletedTotal: row.rounds_completed_total,
    totalWagered: row.total_wagered,
    highestPayout: row.highest_payout,
    exactFaceWins: row.exact_face_wins,
    highLowWins: row.high_low_wins,
    pushCashouts: row.push_cashouts,
    pushPerfectRuns: row.push_perfect_runs,
    blackjackNaturals: row.blackjack_naturals,
    blackjackPushes: row.blackjack_pushes,
    blackjackHitTo21Wins: row.blackjack_hit_to_21_wins,
    pokerStraights: row.poker_straights,
    pokerFullHouses: row.poker_full_houses,
    pokerFourOfAKind: row.poker_four_of_a_kind,
    pokerFiveOfAKind: row.poker_five_of_a_kind,
    playedExactRoll: row.played_exact_roll > 0,
    playedPushYourLuck: row.played_push_your_luck > 0,
    playedBlackjack: row.played_blackjack > 0,
    playedDicePoker: row.played_dice_poker > 0,
  };
};

const getAchievementStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceCasinoAchievementStatsRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        user_id,
        rounds_completed_total,
        total_wagered,
        highest_payout,
        exact_face_wins,
        high_low_wins,
        push_cashouts,
        push_perfect_runs,
        blackjack_naturals,
        blackjack_pushes,
        blackjack_hit_to_21_wins,
        poker_straights,
        poker_full_houses,
        poker_four_of_a_kind,
        poker_five_of_a_kind,
        played_exact_roll,
        played_push_your_luck,
        played_blackjack,
        played_dice_poker,
        updated_at
      FROM dice_casino_achievement_stats
      WHERE user_id = ?
    `,
    )
    .get(userId) as DiceCasinoAchievementStatsRow | undefined;
};

const getOrCreateAchievementStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceCasinoAchievementStatsRow => {
  const existing = getAchievementStatsRow(db, userId);
  if (existing) {
    return existing;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_casino_achievement_stats (
      user_id,
      rounds_completed_total,
      total_wagered,
      highest_payout,
      exact_face_wins,
      high_low_wins,
      push_cashouts,
      push_perfect_runs,
      blackjack_naturals,
      blackjack_pushes,
      blackjack_hit_to_21_wins,
      poker_straights,
      poker_full_houses,
      poker_four_of_a_kind,
      poker_five_of_a_kind,
      played_exact_roll,
      played_push_your_luck,
      played_blackjack,
      played_dice_poker,
      updated_at
    )
    VALUES (@userId, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, @updatedAt)
    ON CONFLICT(user_id)
    DO NOTHING
  `,
  ).run({
    userId,
    updatedAt,
  });

  const created = getAchievementStatsRow(db, userId);
  if (!created) {
    throw new Error(`Failed to initialize casino achievement stats for user ${userId}`);
  }

  return created;
};

const getAchievementStats = (db: SqliteDatabase, userId: string): DiceCasinoAchievementStats => {
  return mapAchievementStatsRow(getOrCreateAchievementStatsRow(db, userId));
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

  const stats = getOrCreateAchievementStatsRow(db, userId);
  db.prepare(
    `
    UPDATE dice_casino_achievement_stats
    SET
      total_wagered = @totalWagered,
      played_exact_roll = @playedExactRoll,
      played_push_your_luck = @playedPushYourLuck,
      played_blackjack = @playedBlackjack,
      played_dice_poker = @playedDicePoker,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    totalWagered: stats.total_wagered + wagered,
    playedExactRoll: stats.played_exact_roll || Number(game === "exact-roll"),
    playedPushYourLuck: stats.played_push_your_luck || Number(game === "push-your-luck"),
    playedBlackjack: stats.played_blackjack || Number(game === "blackjack"),
    playedDicePoker: stats.played_dice_poker || Number(game === "dice-poker"),
    updatedAt: nowIso,
  });
};

const recordDiceCasinoRoundCompleted = (
  db: SqliteDatabase,
  {
    userId,
    game,
    betTier,
    payout,
    outcome,
    achievementEvent,
  }: DiceCasinoAnalyticsCompletion,
): DiceCasinoAchievementStats => {
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

  const stats = getOrCreateAchievementStatsRow(db, userId);
  const nextStats = {
    roundsCompletedTotal: stats.rounds_completed_total + 1,
    totalWagered: Math.max(stats.total_wagered, 0),
    highestPayout: Math.max(stats.highest_payout, payout),
    exactFaceWins: stats.exact_face_wins + Number(achievementEvent?.type === "exact-face-win"),
    highLowWins: stats.high_low_wins + Number(achievementEvent?.type === "high-low-win"),
    pushCashouts: stats.push_cashouts + Number(achievementEvent?.type === "push-cashout"),
    pushPerfectRuns:
      stats.push_perfect_runs + Number(achievementEvent?.type === "push-perfect-run"),
    blackjackNaturals:
      stats.blackjack_naturals + Number(achievementEvent?.type === "blackjack-natural"),
    blackjackPushes: stats.blackjack_pushes + Number(achievementEvent?.type === "blackjack-push"),
    blackjackHitTo21Wins:
      stats.blackjack_hit_to_21_wins + Number(achievementEvent?.type === "blackjack-hit-to-21-win"),
    pokerStraights:
      stats.poker_straights +
      Number(achievementEvent?.type === "poker-hand" && achievementEvent.handKind === "straight"),
    pokerFullHouses:
      stats.poker_full_houses +
      Number(achievementEvent?.type === "poker-hand" && achievementEvent.handKind === "full-house"),
    pokerFourOfAKind:
      stats.poker_four_of_a_kind +
      Number(
        achievementEvent?.type === "poker-hand" && achievementEvent.handKind === "four-of-a-kind",
      ),
    pokerFiveOfAKind:
      stats.poker_five_of_a_kind +
      Number(
        achievementEvent?.type === "poker-hand" && achievementEvent.handKind === "five-of-a-kind",
      ),
    playedExactRoll: stats.played_exact_roll || Number(game === "exact-roll"),
    playedPushYourLuck: stats.played_push_your_luck || Number(game === "push-your-luck"),
    playedBlackjack: stats.played_blackjack || Number(game === "blackjack"),
    playedDicePoker: stats.played_dice_poker || Number(game === "dice-poker"),
  };

  db.prepare(
    `
    UPDATE dice_casino_achievement_stats
    SET
      rounds_completed_total = @roundsCompletedTotal,
      highest_payout = @highestPayout,
      exact_face_wins = @exactFaceWins,
      high_low_wins = @highLowWins,
      push_cashouts = @pushCashouts,
      push_perfect_runs = @pushPerfectRuns,
      blackjack_naturals = @blackjackNaturals,
      blackjack_pushes = @blackjackPushes,
      blackjack_hit_to_21_wins = @blackjackHitTo21Wins,
      poker_straights = @pokerStraights,
      poker_full_houses = @pokerFullHouses,
      poker_four_of_a_kind = @pokerFourOfAKind,
      poker_five_of_a_kind = @pokerFiveOfAKind,
      played_exact_roll = @playedExactRoll,
      played_push_your_luck = @playedPushYourLuck,
      played_blackjack = @playedBlackjack,
      played_dice_poker = @playedDicePoker,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    ...nextStats,
    updatedAt: nowIso,
  });

  return {
    roundsCompletedTotal: nextStats.roundsCompletedTotal,
    totalWagered: stats.total_wagered,
    highestPayout: nextStats.highestPayout,
    exactFaceWins: nextStats.exactFaceWins,
    highLowWins: nextStats.highLowWins,
    pushCashouts: nextStats.pushCashouts,
    pushPerfectRuns: nextStats.pushPerfectRuns,
    blackjackNaturals: nextStats.blackjackNaturals,
    blackjackPushes: nextStats.blackjackPushes,
    blackjackHitTo21Wins: nextStats.blackjackHitTo21Wins,
    pokerStraights: nextStats.pokerStraights,
    pokerFullHouses: nextStats.pokerFullHouses,
    pokerFourOfAKind: nextStats.pokerFourOfAKind,
    pokerFiveOfAKind: nextStats.pokerFiveOfAKind,
    playedExactRoll: nextStats.playedExactRoll > 0,
    playedPushYourLuck: nextStats.playedPushYourLuck > 0,
    playedBlackjack: nextStats.playedBlackjack > 0,
    playedDicePoker: nextStats.playedDicePoker > 0,
  };
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
    getAchievementStats: (userId) => getAchievementStats(db, userId),
    recordRoundStarted: (update) => recordDiceCasinoRoundStarted(db, update),
    recordRoundCompleted: (update) => recordDiceCasinoRoundCompleted(db, update),
  };
};
