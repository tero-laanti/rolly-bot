import { getDiceItemsData } from "../../../rolly-data/load";
import type { DiceItemData } from "../../../rolly-data/types";
import type { SqliteDatabase } from "../../../shared/db";
import { getPips } from "../../economy/domain/balance";

export type DiceShopItemId = string;
export type DiceShopItem = DiceItemData;

type InventoryQuantityRow = {
  item_id: string;
  quantity: number;
};

type InventoryQuantitySelectRow = {
  quantity: number;
};

export type DiceShopPurchaseResult =
  | {
      ok: true;
      item: DiceShopItem;
      quantity: number;
      remainingPips: number;
    }
  | {
      ok: false;
      reason: "unknown-item";
    }
  | {
      ok: false;
      reason: "insufficient-pips";
      item: DiceShopItem;
      currentPips: number;
      requiredPips: number;
    };

export type DiceInventoryEntry = {
  item: DiceShopItem;
  quantity: number;
};

export type ConsumeInventoryItemResult =
  | {
      ok: true;
      item: DiceShopItem;
      remainingQuantity: number;
    }
  | {
      ok: false;
      reason: "unknown-item";
    }
  | {
      ok: false;
      reason: "not-owned";
      item: DiceShopItem;
    };

export const getDiceShopItems = (): DiceShopItem[] => {
  return getDiceItemsData();
};

export const getDiceShopItem = (itemId: string): DiceShopItem | null => {
  return getDiceShopItems().find((item) => item.id === itemId) ?? null;
};

export const getInventoryQuantities = (
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

export const getInventoryQuantity = (
  db: SqliteDatabase,
  userId: string,
  itemId: DiceShopItemId,
): number => {
  const row = db
    .prepare("SELECT quantity FROM inventory_items WHERE user_id = ? AND item_id = ?")
    .get(userId, itemId) as InventoryQuantitySelectRow | undefined;

  return normalizeQuantity(row?.quantity ?? 0);
};

export const getOwnedInventoryEntries = (
  db: SqliteDatabase,
  userId: string,
): DiceInventoryEntry[] => {
  const quantities = getInventoryQuantities(db, userId);
  return getDiceShopItems()
    .map((item) => ({
      item,
      quantity: quantities.get(item.id) ?? 0,
    }))
    .filter((entry) => entry.quantity > 0);
};

export const purchaseDiceShopItem = (
  db: SqliteDatabase,
  { userId, itemId }: { userId: string; itemId: string },
): DiceShopPurchaseResult => {
  const item = getDiceShopItem(itemId);
  if (!item) {
    return {
      ok: false,
      reason: "unknown-item",
    };
  }

  const ensureBalanceRow = db.prepare(`
    INSERT INTO balances (user_id, fame, pips, updated_at)
    VALUES (@userId, 0, 0, @updatedAt)
    ON CONFLICT(user_id)
    DO NOTHING
  `);
  const spendPips = db.prepare(`
    UPDATE balances
    SET pips = pips - @pricePips, updated_at = @updatedAt
    WHERE user_id = @userId AND pips >= @pricePips
  `);

  const run = db.transaction((): DiceShopPurchaseResult => {
    const updatedAt = new Date().toISOString();
    ensureBalanceRow.run({ userId, updatedAt });

    const spendResult = spendPips.run({
      userId,
      pricePips: item.pricePips,
      updatedAt,
    });

    if (spendResult.changes < 1) {
      return {
        ok: false,
        reason: "insufficient-pips",
        item,
        currentPips: getPips(db, userId),
        requiredPips: item.pricePips,
      };
    }

    const quantity = addInventoryItem(db, {
      userId,
      itemId: item.id,
      quantity: 1,
      updatedAt,
    });

    return {
      ok: true,
      item,
      quantity,
      remainingPips: getPips(db, userId),
    };
  });

  return run();
};

export const grantInventoryItem = (
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
  const normalizedQuantity = Math.max(1, Math.floor(quantity));
  return addInventoryItem(db, {
    userId,
    itemId,
    quantity: normalizedQuantity,
    updatedAt: new Date().toISOString(),
  });
};

export const consumeInventoryItem = (
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

  const run = db.transaction((): ConsumeInventoryItemResult => {
    const currentQuantity = getInventoryQuantity(db, userId, item.id);
    if (currentQuantity < 1) {
      return {
        ok: false,
        reason: "not-owned",
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
      ok: true,
      item,
      remainingQuantity,
    };
  });

  return run();
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

const normalizeQuantity = (quantity: number): number => {
  return Math.max(0, Math.floor(quantity));
};
