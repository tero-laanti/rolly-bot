import type {
  ConsumeInventoryItemResult,
  DiceInventoryEntry,
  DiceShopItem,
  DiceShopItemId,
} from "../domain/shop";

export type AutoRollSessionReservation = {
  id: string;
  userId: string;
  itemName: string;
  durationSeconds: number;
  intervalSeconds: number;
  totalRolls: number;
};

export type DiceItemAchievementStats = {
  shopPurchaseCount: number;
  itemUseCount: number;
  usedTriggerRandomGroupEvent: boolean;
  usedAutoRollItem: boolean;
  usedCleanseItem: boolean;
};

export type DicePersonalChargeBonus = {
  unlocked: boolean;
  minutesPerMultiplier: number;
  speedMultiplier: number;
  maxMultiplier: number;
};

export type DicePermanentBonuses = {
  extraBanSlots: number;
  pipRewardBonusPercent: number;
  personalCharge: DicePersonalChargeBonus;
};

export type DiceGardenPlot = {
  userId: string;
  slotIndex: number;
  seedItemId: string;
  dieSides: 4 | 6 | 8 | 10 | 12;
  plantedAt: string;
  readyAt: string;
  updatedAt: string;
};

export type DiceGardenAchievementStats = {
  plantedSeedCount: number;
  harvestedSeedCount: number;
  harvestedD12Count: number;
};

export type DiceInventoryRepository = {
  getInventoryQuantities: (userId: string) => Map<DiceShopItemId, number>;
  getInventoryQuantity: (userId: string, itemId: DiceShopItemId) => number;
  getOwnedInventoryEntries: (userId: string) => DiceInventoryEntry[];
  grantInventoryItem: (input: { userId: string; itemId: string; quantity?: number }) => number;
  consumeInventoryItem: (input: { userId: string; itemId: string }) => ConsumeInventoryItemResult;
  getItemAchievementStats: (userId: string) => DiceItemAchievementStats;
  recordShopPurchase: (userId: string) => DiceItemAchievementStats;
  recordItemUse: (input: { userId: string; itemId: string }) => DiceItemAchievementStats;
};

export type DicePermanentBonusesPort = {
  getPermanentBonuses: (userId: string) => DicePermanentBonuses;
};

export type DiceGardenRepository = {
  getActiveGardenPlots: (userId: string) => DiceGardenPlot[];
  createGardenPlot: (input: {
    userId: string;
    slotIndex: number;
    seedItemId: string;
    dieSides: 4 | 6 | 8 | 10 | 12;
    plantedAt: string;
    readyAt: string;
  }) => DiceGardenPlot;
  clearGardenPlot: (input: { userId: string; slotIndex: number }) => void;
  getGardenAchievementStats: (userId: string) => DiceGardenAchievementStats;
  recordGardenPlant: (userId: string) => DiceGardenAchievementStats;
  recordGardenHarvest: (input: {
    userId: string;
    dieSides: 4 | 6 | 8 | 10 | 12;
  }) => DiceGardenAchievementStats;
};

export type DiceShopCatalog = {
  getDiceShopItems: () => DiceShopItem[];
  getDiceShopItem: (itemId: string) => DiceShopItem | null;
};
