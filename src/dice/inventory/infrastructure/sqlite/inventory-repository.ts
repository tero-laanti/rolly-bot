import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceInventoryRepository, DiceShopCatalog } from "../../application/ports";
import {
  getDiceShopItem,
  getDiceShopItems,
  type ConsumeInventoryItemResult,
  type DiceInventoryEntry,
  type DiceShopItemId,
} from "../../domain/shop";

type InventoryQuantityRow = {
  item_id: string;
  quantity: number;
};

type InventoryQuantitySelectRow = {
  quantity: number;
};

const normalizeQuantity = (quantity: number): number => {
  return Math.max(0, Math.floor(quantity));
};

const getInventoryQuantities = (
  db: SqliteDatabase,
  userId: string,
): Map<DiceShopItemId, number> => {
  const rows = db
    .prepare("SELECT item_id, quantity FROM inventory_items WHERE user_id = ? ORDER BY item_id ASC")
    .all(userId) as InventoryQuantityRow[];

  const quantities = new Map<DiceShopItemId, number>();
  for (const row of rows) {
    const item = getDiceShopItem(row.item_id);
    if (!item) {
      continue;
    }

    quantities.set(item.id, normalizeQuantity(row.quantity));
  }

  return quantities;
};

const getInventoryQuantity = (
  db: SqliteDatabase,
  userId: string,
  itemId: DiceShopItemId,
): number => {
  const row = db
    .prepare("SELECT quantity FROM inventory_items WHERE user_id = ? AND item_id = ?")
    .get(userId, itemId) as InventoryQuantitySelectRow | undefined;

  return normalizeQuantity(row?.quantity ?? 0);
};

const getOwnedInventoryEntries = (db: SqliteDatabase, userId: string): DiceInventoryEntry[] => {
  const quantities = getInventoryQuantities(db, userId);
  return getDiceShopItems()
    .map((item) => ({
      item,
      quantity: quantities.get(item.id) ?? 0,
    }))
    .filter((entry) => entry.quantity > 0);
};

const addInventoryItem = (
  db: SqliteDatabase,
  input: {
    userId: string;
    itemId: string;
    quantity: number;
    updatedAt: string;
  },
): number => {
  db.prepare(
    `
    INSERT INTO inventory_items (user_id, item_id, quantity, first_acquired_at, updated_at)
    VALUES (@userId, @itemId, @quantity, @updatedAt, @updatedAt)
    ON CONFLICT(user_id, item_id)
    DO UPDATE SET quantity = inventory_items.quantity + excluded.quantity, updated_at = excluded.updated_at
  `,
  ).run(input);

  return getInventoryQuantity(db, input.userId, input.itemId);
};

const grantInventoryItem = (
  db: SqliteDatabase,
  {
    userId,
    itemId,
    quantity = 1,
  }: {
    userId: string;
    itemId: string;
    quantity?: number;
  },
): number => {
  return addInventoryItem(db, {
    userId,
    itemId,
    quantity: Math.max(1, Math.floor(quantity)),
    updatedAt: new Date().toISOString(),
  });
};

const consumeInventoryItem = (
  db: SqliteDatabase,
  { userId, itemId }: { userId: string; itemId: string },
): ConsumeInventoryItemResult => {
  const item = getDiceShopItem(itemId);
  if (!item) {
    return {
      ok: false,
      reason: "unknown-item",
    };
  }

  return db.transaction(() => {
    const currentQuantity = getInventoryQuantity(db, userId, item.id);
    if (currentQuantity < 1) {
      return {
        ok: false as const,
        reason: "not-owned" as const,
        item,
      };
    }

    const remainingQuantity = currentQuantity - 1;
    if (remainingQuantity > 0) {
      db.prepare(
        `
        UPDATE inventory_items
        SET quantity = @quantity, updated_at = @updatedAt
        WHERE user_id = @userId AND item_id = @itemId
      `,
      ).run({
        userId,
        itemId: item.id,
        quantity: remainingQuantity,
        updatedAt: new Date().toISOString(),
      });
    } else {
      db.prepare("DELETE FROM inventory_items WHERE user_id = ? AND item_id = ?").run(
        userId,
        item.id,
      );
    }

    return {
      ok: true as const,
      item,
      remainingQuantity,
    };
  })();
};

export const createSqliteInventoryRepository = (db: SqliteDatabase): DiceInventoryRepository => {
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
