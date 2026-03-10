import type { SqliteDatabase } from "../../../../shared/db";
import { diceAchievements } from "../../../progression/domain/achievements";
import { getUserDiceAchievements } from "../../../progression/domain/achievements-store";

export type DiceAchievementsView = {
  content: string;
  ephemeral: boolean;
};

export const queryDiceAchievements = (
  db: SqliteDatabase,
  userId: string,
): DiceAchievementsView => {
  const earnedIds = new Set(getUserDiceAchievements(db, userId));
  if (earnedIds.size === 0) {
    return {
      content: "No dice achievements unlocked yet.",
      ephemeral: false,
    };
  }

  const lines = diceAchievements
    .filter((achievement) => earnedIds.has(achievement.id))
    .map((achievement) => achievement.name);

  return {
    content: `Your dice achievements (${earnedIds.size}/${diceAchievements.length}):\n${lines.join("\n")}`,
    ephemeral: false,
  };
};
