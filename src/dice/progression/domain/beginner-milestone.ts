import type { DiceAchievementId } from "./achievements";

export const beginnerMilestoneAchievementId: DiceAchievementId = "manual-rolls-5";

export const hasReachedBeginnerMilestone = (
  achievementIds: readonly DiceAchievementId[],
): boolean => {
  return achievementIds.includes(beginnerMilestoneAchievementId);
};
