import type { DiceItemAchievementStats } from "./ports";

export const getDiceItemAchievementIds = (stats: DiceItemAchievementStats): string[] => {
  const achievementIds: string[] = [];

  if (stats.shopPurchaseCount >= 1) {
    achievementIds.push("shop-first-purchase");
  }
  if (stats.itemUseCount >= 1) {
    achievementIds.push("item-first-use");
  }
  if (stats.usedTriggerRandomGroupEvent) {
    achievementIds.push("item-chaos-flare");
  }
  if (stats.usedAutoRollItem) {
    achievementIds.push("item-clockwork-croupier");
  }
  if (stats.usedCleanseItem) {
    achievementIds.push("item-cleanse-salt");
  }

  return achievementIds;
};
