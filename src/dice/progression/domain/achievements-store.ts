import { createRollContext, diceAchievements, type DiceAchievementId } from "./achievements";

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
