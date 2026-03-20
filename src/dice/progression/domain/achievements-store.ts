import {
  createRollContext,
  diceAchievements,
  getDiceAchievementPipReward,
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
    .filter((achievement) => achievement.evaluate(context))
    .map((achievement) => achievement.id);
};

export const getAchievementPipRewardTotal = (
  achievementIds: readonly DiceAchievementId[],
): number => {
  return achievementIds.reduce((total, achievementId) => {
    return total + getDiceAchievementPipReward(achievementId);
  }, 0);
};
