import type { SqliteDatabase } from "../../../shared/db";
import {
  createRollContext,
  diceAchievements,
  getDiceAchievement,
  type DiceAchievementId,
} from "./achievements";

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
