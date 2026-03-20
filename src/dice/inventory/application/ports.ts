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

export type DiceShopCatalog = {
  getDiceShopItems: () => DiceShopItem[];
  getDiceShopItem: (itemId: string) => DiceShopItem | null;
};
