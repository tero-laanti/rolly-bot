import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceProgressionRepository } from "../../application/ports";
import { getDiceAchievement, type DiceAchievementId } from "../../domain/achievements";

const applyPipsDelta = (
  db: SqliteDatabase,
  userId: string,
  amount: number,
  updatedAt: string,
): void => {
  db.prepare(
    `
    INSERT INTO balances (user_id, pips, updated_at)
    VALUES (@userId, @amount, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET pips = balances.pips + excluded.pips, updated_at = excluded.updated_at
  `,
  ).run({
    userId,
    amount,
    updatedAt,
  });
};

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
    let totalPipReward = 0;

    for (const achievementId of achievementIds) {
      const achievement = getDiceAchievement(achievementId);
      if (!achievement) {
        continue;
      }

      const result = insert.run({ userId, achievementId, earnedAt });
      if (result.changes > 0) {
        newlyEarned.push(achievementId);
        totalPipReward += achievement.pipReward;
      }
    }

    if (totalPipReward > 0) {
      applyPipsDelta(db, userId, totalPipReward, earnedAt);
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
