import { diceAchievements } from "../../../progression/domain/achievements";
import type { DiceProgressionRepository } from "../ports";

export type DiceAchievementsView = {
  content: string;
  ephemeral: boolean;
};

type QueryDiceAchievementsDependencies = {
  progression: Pick<DiceProgressionRepository, "getUserDiceAchievements">;
};

export const createQueryDiceAchievementsUseCase = ({
  progression,
}: QueryDiceAchievementsDependencies) => {
  return (userId: string): DiceAchievementsView => {
    const earnedIds = new Set(progression.getUserDiceAchievements(userId));
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
};
