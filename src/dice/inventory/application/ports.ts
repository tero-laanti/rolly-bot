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

export type DiceInventoryRepository = {
  getInventoryQuantities: (userId: string) => Map<DiceShopItemId, number>;
  getInventoryQuantity: (userId: string, itemId: DiceShopItemId) => number;
  getOwnedInventoryEntries: (userId: string) => DiceInventoryEntry[];
  grantInventoryItem: (
    input: {
      userId: string;
      itemId: string;
      quantity?: number;
    },
  ) => number;
  consumeInventoryItem: (input: {
    userId: string;
    itemId: string;
  }) => ConsumeInventoryItemResult;
};

export type DiceShopCatalog = {
  getDiceShopItems: () => DiceShopItem[];
  getDiceShopItem: (itemId: string) => DiceShopItem | null;
};
