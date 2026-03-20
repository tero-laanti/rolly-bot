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

type DiceItemAchievementStatsRow = {
  user_id: string;
  shop_purchase_count: number;
  item_use_count: number;
  used_trigger_random_group_event: number;
  used_auto_roll_item: number;
  used_cleanse_item: number;
  updated_at: string;
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

const getItemAchievementStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceItemAchievementStatsRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        user_id,
        shop_purchase_count,
        item_use_count,
        used_trigger_random_group_event,
        used_auto_roll_item,
        used_cleanse_item,
        updated_at
      FROM dice_item_achievement_stats
      WHERE user_id = ?
    `,
    )
    .get(userId) as DiceItemAchievementStatsRow | undefined;
};

const getOrCreateItemAchievementStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceItemAchievementStatsRow => {
  const existing = getItemAchievementStatsRow(db, userId);
  if (existing) {
    return existing;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_item_achievement_stats (
      user_id,
      shop_purchase_count,
      item_use_count,
      used_trigger_random_group_event,
      used_auto_roll_item,
      used_cleanse_item,
      updated_at
    )
    VALUES (@userId, 0, 0, 0, 0, 0, @updatedAt)
    ON CONFLICT(user_id)
    DO NOTHING
  `,
  ).run({
    userId,
    updatedAt,
  });

  const created = getItemAchievementStatsRow(db, userId);
  if (!created) {
    throw new Error(`Failed to initialize item achievement stats for user ${userId}`);
  }

  return created;
};

const mapItemAchievementStats = (row: DiceItemAchievementStatsRow) => {
  return {
    shopPurchaseCount: row.shop_purchase_count,
    itemUseCount: row.item_use_count,
    usedTriggerRandomGroupEvent: row.used_trigger_random_group_event > 0,
    usedAutoRollItem: row.used_auto_roll_item > 0,
    usedCleanseItem: row.used_cleanse_item > 0,
  };
};

const getItemAchievementStats = (db: SqliteDatabase, userId: string) => {
  return mapItemAchievementStats(getOrCreateItemAchievementStatsRow(db, userId));
};

const recordShopPurchase = (db: SqliteDatabase, userId: string) => {
  const stats = getOrCreateItemAchievementStatsRow(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    UPDATE dice_item_achievement_stats
    SET
      shop_purchase_count = @shopPurchaseCount,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    shopPurchaseCount: stats.shop_purchase_count + 1,
    updatedAt,
  });

  return {
    shopPurchaseCount: stats.shop_purchase_count + 1,
    itemUseCount: stats.item_use_count,
    usedTriggerRandomGroupEvent: stats.used_trigger_random_group_event > 0,
    usedAutoRollItem: stats.used_auto_roll_item > 0,
    usedCleanseItem: stats.used_cleanse_item > 0,
  };
};

const recordItemUse = (
  db: SqliteDatabase,
  {
    userId,
    itemId,
  }: {
    userId: string;
    itemId: string;
  },
) => {
  const stats = getOrCreateItemAchievementStatsRow(db, userId);
  const updatedAt = new Date().toISOString();
  const usedTriggerRandomGroupEvent =
    stats.used_trigger_random_group_event > 0 || itemId === "chaos-flare";
  const usedAutoRollItem = stats.used_auto_roll_item > 0 || itemId === "clockwork-croupier";
  const usedCleanseItem = stats.used_cleanse_item > 0 || itemId === "cleanse-salt";

  db.prepare(
    `
    UPDATE dice_item_achievement_stats
    SET
      item_use_count = @itemUseCount,
      used_trigger_random_group_event = @usedTriggerRandomGroupEvent,
      used_auto_roll_item = @usedAutoRollItem,
      used_cleanse_item = @usedCleanseItem,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    itemUseCount: stats.item_use_count + 1,
    usedTriggerRandomGroupEvent: Number(usedTriggerRandomGroupEvent),
    usedAutoRollItem: Number(usedAutoRollItem),
    usedCleanseItem: Number(usedCleanseItem),
    updatedAt,
  });

  return {
    shopPurchaseCount: stats.shop_purchase_count,
    itemUseCount: stats.item_use_count + 1,
    usedTriggerRandomGroupEvent,
    usedAutoRollItem,
    usedCleanseItem,
  };
};

export const createSqliteInventoryRepository = (db: SqliteDatabase): DiceInventoryRepository => {
  return {
    getInventoryQuantities: (userId) => getInventoryQuantities(db, userId),
    getInventoryQuantity: (userId, itemId) => getInventoryQuantity(db, userId, itemId),
    getOwnedInventoryEntries: (userId) => getOwnedInventoryEntries(db, userId),
    grantInventoryItem: (input) => grantInventoryItem(db, input),
    consumeInventoryItem: (input) => consumeInventoryItem(db, input),
    getItemAchievementStats: (userId) => getItemAchievementStats(db, userId),
    recordShopPurchase: (userId) => recordShopPurchase(db, userId),
    recordItemUse: (input) => recordItemUse(db, input),
  };
};

export const createDiceShopCatalog = (): DiceShopCatalog => {
  return {
    getDiceShopItems,
    getDiceShopItem,
  };
};
