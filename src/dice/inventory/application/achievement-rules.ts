import type { DiceGardenAchievementStats, DiceItemAchievementStats } from "./ports";

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

export const getDiceShopPurchaseAchievementIds = (itemId: string): string[] => {
  if (itemId === "seed-satchel") {
    return ["item-seed-satchel"];
  }

  return [];
};

export const getDiceGardenAchievementIds = (stats: DiceGardenAchievementStats): string[] => {
  const achievementIds: string[] = [];

  if (stats.plantedSeedCount >= 1) {
    achievementIds.push("garden-first-plant");
  }
  if (stats.harvestedSeedCount >= 1) {
    achievementIds.push("garden-first-harvest");
  }
  if (stats.harvestedD12Count >= 1) {
    achievementIds.push("garden-d12-harvest");
  }
  if (stats.harvestedSeedCount >= 10) {
    achievementIds.push("garden-ten-harvests");
  }

  return achievementIds;
};
