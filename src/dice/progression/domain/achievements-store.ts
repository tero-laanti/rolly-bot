import {
  createRollContext,
  diceAchievements,
  getDiceAchievementPipReward,
  matchesAnalyticsAchievement,
  matchesRollAchievement,
  type DiceAchievementAnalyticsContext,
  type DiceAchievementId,
} from "./achievements";

export const getDiceAchievementsForRoll = (
  rolls: number[],
  rolledAtMs: number = Date.now(),
): DiceAchievementId[] => {
  if (rolls.length === 0) {
    return [];
  }

  const context = createRollContext(rolls, rolledAtMs);
  return diceAchievements
    .filter((achievement) => matchesRollAchievement(achievement.id, context))
    .map((achievement) => achievement.id);
};

export const getDiceAchievementsForAnalytics = (
  context: DiceAchievementAnalyticsContext,
): DiceAchievementId[] => {
  return diceAchievements
    .filter((achievement) => matchesAnalyticsAchievement(achievement.id, context))
    .map((achievement) => achievement.id);
};

export const getAchievementPipRewardTotal = (
  achievementIds: readonly DiceAchievementId[],
): number => {
  return achievementIds.reduce((total, achievementId) => {
    return total + getDiceAchievementPipReward(achievementId);
  }, 0);
};
