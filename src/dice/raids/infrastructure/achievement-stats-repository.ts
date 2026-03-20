import type { SqliteDatabase } from "../../../shared/db";
import type { DiceRaidAchievementStats } from "../application/achievement-rules";

type DiceRaidAchievementStatsRow = {
  user_id: string;
  joined_count: number;
  hit_count: number;
  eligible_clear_count: number;
  top_damage_clear_count: number;
  lifetime_damage: number;
  highest_cleared_boss_level: number;
  tourist_success_count: number;
  updated_at: string;
};

const getStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceRaidAchievementStatsRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        user_id,
        joined_count,
        hit_count,
        eligible_clear_count,
        top_damage_clear_count,
        lifetime_damage,
        highest_cleared_boss_level,
        tourist_success_count,
        updated_at
      FROM dice_raid_achievement_stats
      WHERE user_id = ?
    `,
    )
    .get(userId) as DiceRaidAchievementStatsRow | undefined;
};

const getOrCreateStatsRow = (db: SqliteDatabase, userId: string): DiceRaidAchievementStatsRow => {
  const existing = getStatsRow(db, userId);
  if (existing) {
    return existing;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_raid_achievement_stats (
      user_id,
      joined_count,
      hit_count,
      eligible_clear_count,
      top_damage_clear_count,
      lifetime_damage,
      highest_cleared_boss_level,
      tourist_success_count,
      updated_at
    )
    VALUES (@userId, 0, 0, 0, 0, 0, 0, 0, @updatedAt)
    ON CONFLICT(user_id)
    DO NOTHING
  `,
  ).run({
    userId,
    updatedAt,
  });

  const created = getStatsRow(db, userId);
  if (!created) {
    throw new Error(`Failed to initialize raid achievement stats for user ${userId}`);
  }

  return created;
};

const mapStats = (row: DiceRaidAchievementStatsRow): DiceRaidAchievementStats => {
  return {
    joinedCount: row.joined_count,
    hitCount: row.hit_count,
    eligibleClearCount: row.eligible_clear_count,
    topDamageClearCount: row.top_damage_clear_count,
    lifetimeDamage: row.lifetime_damage,
    highestClearedBossLevel: row.highest_cleared_boss_level,
    touristSuccessCount: row.tourist_success_count,
  };
};

export const recordRaidJoin = (db: SqliteDatabase, userId: string): DiceRaidAchievementStats => {
  const stats = getOrCreateStatsRow(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_raid_achievement_stats
    SET joined_count = @joinedCount, updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    joinedCount: stats.joined_count + 1,
    updatedAt,
  });

  return {
    ...mapStats(stats),
    joinedCount: stats.joined_count + 1,
  };
};

export const recordRaidHit = (
  db: SqliteDatabase,
  {
    userId,
    damage,
  }: {
    userId: string;
    damage: number;
  },
): DiceRaidAchievementStats => {
  const stats = getOrCreateStatsRow(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_raid_achievement_stats
    SET
      hit_count = @hitCount,
      lifetime_damage = @lifetimeDamage,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    hitCount: stats.hit_count + 1,
    lifetimeDamage: stats.lifetime_damage + Math.max(0, Math.floor(damage)),
    updatedAt,
  });

  return {
    ...mapStats(stats),
    hitCount: stats.hit_count + 1,
    lifetimeDamage: stats.lifetime_damage + Math.max(0, Math.floor(damage)),
  };
};

export const recordRaidSuccessResolution = (
  db: SqliteDatabase,
  {
    userId,
    bossLevel,
    rewardEligible,
    topDamage,
    tourist,
  }: {
    userId: string;
    bossLevel: number;
    rewardEligible: boolean;
    topDamage: boolean;
    tourist: boolean;
  },
): DiceRaidAchievementStats => {
  const stats = getOrCreateStatsRow(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_raid_achievement_stats
    SET
      eligible_clear_count = @eligibleClearCount,
      top_damage_clear_count = @topDamageClearCount,
      highest_cleared_boss_level = @highestClearedBossLevel,
      tourist_success_count = @touristSuccessCount,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    eligibleClearCount: stats.eligible_clear_count + Number(rewardEligible),
    topDamageClearCount: stats.top_damage_clear_count + Number(topDamage),
    highestClearedBossLevel: rewardEligible
      ? Math.max(stats.highest_cleared_boss_level, Math.max(1, Math.floor(bossLevel)))
      : stats.highest_cleared_boss_level,
    touristSuccessCount: stats.tourist_success_count + Number(tourist),
    updatedAt,
  });

  return {
    ...mapStats(stats),
    eligibleClearCount: stats.eligible_clear_count + Number(rewardEligible),
    topDamageClearCount: stats.top_damage_clear_count + Number(topDamage),
    highestClearedBossLevel: rewardEligible
      ? Math.max(stats.highest_cleared_boss_level, Math.max(1, Math.floor(bossLevel)))
      : stats.highest_cleared_boss_level,
    touristSuccessCount: stats.tourist_success_count + Number(tourist),
  };
};
