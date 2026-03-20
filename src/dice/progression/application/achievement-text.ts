import type { DiceAchievementId } from "../domain/achievements";
import { getDiceAchievement } from "../domain/achievements";

const formatAchievementUnlockEntry = (achievementId: DiceAchievementId): string => {
  const achievement = getDiceAchievement(achievementId);
  if (!achievement) {
    return achievementId;
  }

  if (!achievement.unlockReasonText) {
    return achievement.name;
  }

  return `${achievement.name} (${achievement.unlockReasonText})`;
};

export const formatAchievementUnlockText = (
  achievementIds: readonly DiceAchievementId[],
): string => {
  if (achievementIds.length < 1) {
    return "";
  }

  const entries = achievementIds.map(formatAchievementUnlockEntry);
  const label = entries.length === 1 ? "Achievement" : "Achievements";
  return `${label} unlocked: ${entries.join(", ")}.`;
};

export const appendAchievementUnlockText = (
  content: string,
  achievementIds: readonly DiceAchievementId[],
  separator = "\n",
): string => {
  const achievementText = formatAchievementUnlockText(achievementIds);
  if (!achievementText) {
    return content;
  }

  return `${content}${separator}${achievementText}`;
};
