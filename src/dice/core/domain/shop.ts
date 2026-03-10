import type { SqliteDatabase } from "../../../shared/db";
import { getPips } from "../../../shared/economy";

type DiceShopItemDefinition = {
  id: string;
  name: string;
  description: string;
  pricePips: number;
  useText: string;
};

const diceShopItems = [
  {
    id: "debug-token",
    name: "Debug Token",
    description: "A no-op test item for validating the Pips shop and inventory flow.",
    pricePips: 5,
    useText: "Debug Token consumed. No gameplay effect applied.",
  },
] as const satisfies readonly DiceShopItemDefinition[];

export type DiceShopItemId = (typeof diceShopItems)[number]["id"];
export type DiceShopItem = (typeof diceShopItems)[number];

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

export type DiceInventoryUseResult =
  | {
      ok: true;
      item: DiceShopItem;
      remainingQuantity: number;
      outcomeText: string;
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

const diceShopItemsById = new Map<DiceShopItemId, DiceShopItem>(
  diceShopItems.map((item) => [item.id, item]),
);

export const getDiceShopItems = (): readonly DiceShopItem[] => {
  return diceShopItems;
};

export const getDiceShopItem = (itemId: string): DiceShopItem | null => {
  return diceShopItemsById.get(itemId as DiceShopItemId) ?? null;
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
  return getInventoryQuantities(db, userId).get(itemId) ?? 0;
};

export const getOwnedInventoryEntries = (
  db: SqliteDatabase,
  userId: string,
): DiceInventoryEntry[] => {
  return getDiceShopItems()
    .map((item) => ({
      item,
      quantity: getInventoryQuantity(db, userId, item.id),
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
  const addInventoryItem = db.prepare(`
    INSERT INTO inventory_items (user_id, item_id, quantity, first_acquired_at, updated_at)
    VALUES (@userId, @itemId, 1, @updatedAt, @updatedAt)
    ON CONFLICT(user_id, item_id)
    DO UPDATE SET quantity = inventory_items.quantity + 1, updated_at = excluded.updated_at
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

    addInventoryItem.run({
      userId,
      itemId: item.id,
      updatedAt,
    });

    return {
      ok: true,
      item,
      quantity: getInventoryQuantity(db, userId, item.id),
      remainingPips: getPips(db, userId),
    };
  });

  return run();
};

export const useDiceInventoryItem = (
  db: SqliteDatabase,
  { userId, itemId }: { userId: string; itemId: string },
): DiceInventoryUseResult => {
  const item = getDiceShopItem(itemId);
  if (!item) {
    return {
      ok: false,
      reason: "unknown-item",
    };
  }

  const selectQuantity = db.prepare(
    "SELECT quantity FROM inventory_items WHERE user_id = ? AND item_id = ?",
  );
  const updateQuantity = db.prepare(`
    UPDATE inventory_items
    SET quantity = @quantity, updated_at = @updatedAt
    WHERE user_id = @userId AND item_id = @itemId
  `);
  const deleteItem = db.prepare("DELETE FROM inventory_items WHERE user_id = ? AND item_id = ?");

  const run = db.transaction((): DiceInventoryUseResult => {
    const row = selectQuantity.get(userId, item.id) as InventoryQuantitySelectRow | undefined;
    const currentQuantity = normalizeQuantity(row?.quantity ?? 0);
    if (currentQuantity < 1) {
      return {
        ok: false,
        reason: "not-owned",
        item,
      };
    }

    const remainingQuantity = currentQuantity - 1;
    if (remainingQuantity > 0) {
      updateQuantity.run({
        userId,
        itemId: item.id,
        quantity: remainingQuantity,
        updatedAt: new Date().toISOString(),
      });
    } else {
      deleteItem.run(userId, item.id);
    }

    return {
      ok: true,
      item,
      remainingQuantity,
      outcomeText: item.useText,
    };
  });

  return run();
};

const normalizeQuantity = (quantity: number): number => {
  return Math.max(0, Math.floor(quantity));
};
