import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceInventoryRepository, DiceShopCatalog } from "../../application/ports";
import {
  consumeInventoryItem,
  getDiceShopItem,
  getDiceShopItems,
  getInventoryQuantities,
  getInventoryQuantity,
  getOwnedInventoryEntries,
  grantInventoryItem,
} from "../../domain/shop";

export const createSqliteInventoryRepository = (
  db: SqliteDatabase,
): DiceInventoryRepository => {
  return {
    getInventoryQuantities: (userId) => getInventoryQuantities(db, userId),
    getInventoryQuantity: (userId, itemId) => getInventoryQuantity(db, userId, itemId),
    getOwnedInventoryEntries: (userId) => getOwnedInventoryEntries(db, userId),
    grantInventoryItem: (input) => grantInventoryItem(db, input),
    consumeInventoryItem: (input) => consumeInventoryItem(db, input),
  };
};

export const createDiceShopCatalog = (): DiceShopCatalog => {
  return {
    getDiceShopItems,
    getDiceShopItem,
  };
};
