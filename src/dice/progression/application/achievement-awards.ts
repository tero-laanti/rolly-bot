import type { DiceAchievementId } from "../domain/achievements";
import { isManualDiceAchievement } from "../domain/achievements";
import type { DiceProgressionRepository } from "./ports";

const toUniqueAchievementIds = (achievementIds: readonly DiceAchievementId[]): DiceAchievementId[] => {
  return [...new Set(achievementIds)];
};

export const getKnownManualAchievementIds = (
  achievementIds: readonly DiceAchievementId[],
): DiceAchievementId[] => {
  return toUniqueAchievementIds(achievementIds).filter((achievementId) =>
    isManualDiceAchievement(achievementId),
  );
};

export const awardManualDiceAchievements = (
  progression: Pick<DiceProgressionRepository, "awardAchievements">,
  userId: string,
  achievementIds: readonly DiceAchievementId[],
): DiceAchievementId[] => {
  const manualAchievementIds = getKnownManualAchievementIds(achievementIds);
  if (manualAchievementIds.length < 1) {
    return [];
  }

  return progression.awardAchievements(userId, manualAchievementIds);
};
