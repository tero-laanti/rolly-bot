import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceProgressionRepository } from "../../application/ports";
import { getDiceAchievement, type DiceAchievementId } from "../../domain/achievements";

export const createSqliteProgressionAchievementsRepository = (
  db: SqliteDatabase,
): Pick<
  DiceProgressionRepository,
  "getUserDiceAchievements" | "awardAchievements" | "clearUserDiceAchievements"
> => {
  const awardAchievements = (
    userId: string,
    achievementIds: DiceAchievementId[],
  ): DiceAchievementId[] => {
    if (achievementIds.length === 0) {
      return [];
    }

    const earnedAt = new Date().toISOString();
    const insert = db.prepare(
      `
      INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at)
      VALUES (@userId, @achievementId, @earnedAt)
    `,
    );

    const newlyEarned: DiceAchievementId[] = [];
    for (const achievementId of achievementIds) {
      if (!getDiceAchievement(achievementId)) {
        continue;
      }

      const result = insert.run({ userId, achievementId, earnedAt });
      if (result.changes > 0) {
        newlyEarned.push(achievementId);
      }
    }

    return newlyEarned;
  };

  const getUserDiceAchievements = (userId: string): DiceAchievementId[] => {
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

  const clearUserDiceAchievements = (userId: string): void => {
    db.prepare("DELETE FROM user_achievements WHERE user_id = ?").run(userId);
  };

  return {
    getUserDiceAchievements,
    awardAchievements,
    clearUserDiceAchievements,
  };
};
