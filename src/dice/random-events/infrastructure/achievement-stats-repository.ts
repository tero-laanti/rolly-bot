import type { SqliteDatabase } from "../../../shared/db";
import type {
  RandomEventAppliedNegativeEffect,
  RandomEventAttemptResolution,
} from "./live-runtime-resolution";
import type { RandomEventScenarioRender } from "../domain/content";
import type { RandomEventAchievementStats } from "../application/achievement-rules";

type RandomEventAchievementStatsRow = {
  user_id: string;
  success_count: number;
  failure_count: number;
  multi_user_success_count: number;
  legendary_success_count: number;
  lockout_count: number;
  keep_open_comeback_count: number;
  negative_effect_expires_at: string | null;
  updated_at: string;
};

const getStatsRow = (
  db: SqliteDatabase,
  userId: string,
): RandomEventAchievementStatsRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        user_id,
        success_count,
        failure_count,
        multi_user_success_count,
        legendary_success_count,
        lockout_count,
        keep_open_comeback_count,
        negative_effect_expires_at,
        updated_at
      FROM dice_random_event_achievement_stats
      WHERE user_id = ?
    `,
    )
    .get(userId) as RandomEventAchievementStatsRow | undefined;
};

const getOrCreateStatsRow = (
  db: SqliteDatabase,
  userId: string,
): RandomEventAchievementStatsRow => {
  const existing = getStatsRow(db, userId);
  if (existing) {
    return existing;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_random_event_achievement_stats (
      user_id,
      success_count,
      failure_count,
      multi_user_success_count,
      legendary_success_count,
      lockout_count,
      keep_open_comeback_count,
      negative_effect_expires_at,
      updated_at
    )
    VALUES (@userId, 0, 0, 0, 0, 0, 0, NULL, @updatedAt)
    ON CONFLICT(user_id)
    DO NOTHING
  `,
  ).run({
    userId,
    updatedAt,
  });

  const created = getStatsRow(db, userId);
  if (!created) {
    throw new Error(`Failed to initialize random-event achievement stats for user ${userId}`);
  }

  return created;
};

const getLatestNegativeExpiryIso = (
  appliedNegativeEffects: readonly RandomEventAppliedNegativeEffect[],
): string | null => {
  let latestExpiryMs = 0;

  for (const effect of appliedNegativeEffects) {
    if (effect.type === "temporary-lockout" && effect.expiresAtMs !== null) {
      latestExpiryMs = Math.max(latestExpiryMs, effect.expiresAtMs);
    }
  }

  return latestExpiryMs > 0 ? new Date(latestExpiryMs).toISOString() : null;
};

export const recordRandomEventAchievementStats = (
  db: SqliteDatabase,
  {
    selection,
    userId,
    attemptResolution,
    hadKeepOpenFailureBeforeSuccess,
    nowMs,
  }: {
    selection: RandomEventScenarioRender;
    userId: string;
    attemptResolution: RandomEventAttemptResolution;
    hadKeepOpenFailureBeforeSuccess: boolean;
    nowMs: number;
  },
): {
  stats: RandomEventAchievementStats;
  cursedEvening: boolean;
} => {
  const stats = getOrCreateStatsRow(db, userId);
  const currentNegativeExpiryMs = stats.negative_effect_expires_at
    ? Date.parse(stats.negative_effect_expires_at)
    : Number.NaN;
  const nextNegativeExpiryIso = getLatestNegativeExpiryIso(
    attemptResolution.appliedNegativeEffects,
  );
  const nextNegativeExpiryMs = nextNegativeExpiryIso
    ? Date.parse(nextNegativeExpiryIso)
    : Number.NaN;
  const hasAppliedNegativeEffect = attemptResolution.appliedNegativeEffects.length > 0;
  const appliedLockoutCount = Number(
    attemptResolution.appliedNegativeEffects.some((effect) => effect.type === "temporary-lockout"),
  );
  const cursedEvening =
    hasAppliedNegativeEffect && attemptResolution.hadActiveNegativeEffectBeforeAttempt;
  const isSuccess = attemptResolution.resolution === "resolve-success";
  const updatedAt = new Date(nowMs).toISOString();

  const nextStats = {
    successCount: stats.success_count + Number(isSuccess),
    failureCount: stats.failure_count + Number(!isSuccess),
    multiUserSuccessCount:
      stats.multi_user_success_count +
      Number(isSuccess && selection.scenario.claimPolicy === "multi-user"),
    legendarySuccessCount:
      stats.legendary_success_count +
      Number(isSuccess && selection.scenario.rarity === "legendary"),
    lockoutCount: stats.lockout_count + appliedLockoutCount,
    keepOpenComebackCount:
      stats.keep_open_comeback_count + Number(isSuccess && hadKeepOpenFailureBeforeSuccess),
    negativeEffectExpiresAt:
      Number.isFinite(nextNegativeExpiryMs) && nextNegativeExpiryMs > nowMs
        ? nextNegativeExpiryIso
        : Number.isFinite(currentNegativeExpiryMs) && currentNegativeExpiryMs > nowMs
          ? stats.negative_effect_expires_at
          : null,
  };

  db.prepare(
    `
    UPDATE dice_random_event_achievement_stats
    SET
      success_count = @successCount,
      failure_count = @failureCount,
      multi_user_success_count = @multiUserSuccessCount,
      legendary_success_count = @legendarySuccessCount,
      lockout_count = @lockoutCount,
      keep_open_comeback_count = @keepOpenComebackCount,
      negative_effect_expires_at = @negativeEffectExpiresAt,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    ...nextStats,
    updatedAt,
  });

  return {
    stats: {
      successCount: nextStats.successCount,
      failureCount: nextStats.failureCount,
      multiUserSuccessCount: nextStats.multiUserSuccessCount,
      legendarySuccessCount: nextStats.legendarySuccessCount,
      lockoutCount: nextStats.lockoutCount,
      keepOpenComebackCount: nextStats.keepOpenComebackCount,
    },
    cursedEvening,
  };
};
