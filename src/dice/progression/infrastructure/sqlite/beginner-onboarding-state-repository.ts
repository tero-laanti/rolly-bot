import type { SqliteDatabase } from "../../../../shared/db";

const beginnerRollerAchievementId = "manual-rolls-5";

export const createSqliteBeginnerOnboardingStateRepository = (db: SqliteDatabase) => {
  const hasBeginnerRollerAchievement = (userId: string): boolean => {
    const row = db
      .prepare(
        `
        SELECT 1
        FROM user_achievements
        WHERE user_id = ? AND achievement_id = ?
        LIMIT 1
      `,
      )
      .get(userId, beginnerRollerAchievementId);

    return row !== undefined;
  };

  const hasGuildGraduated = (guildId: string, userId: string): boolean => {
    const row = db
      .prepare(
        `
        SELECT 1
        FROM dice_beginner_onboarding_guild_graduations
        WHERE guild_id = ? AND user_id = ?
        LIMIT 1
      `,
      )
      .get(guildId, userId);

    return row !== undefined;
  };

  const markGuildGraduated = (guildId: string, userId: string): boolean => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `
        INSERT OR IGNORE INTO dice_beginner_onboarding_guild_graduations (
          guild_id,
          user_id,
          graduated_at,
          updated_at
        )
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(guildId, userId, now, now);

    return result.changes > 0;
  };

  return {
    hasBeginnerRollerAchievement,
    hasGuildGraduated,
    markGuildGraduated,
  };
};
