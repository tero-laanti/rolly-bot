import type { SqliteDatabase } from "../../../../shared/db";
import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import { getEconomySnapshot } from "../../../economy/domain/balance";
import {
  getDiceShopItems,
  getInventoryQuantities,
  purchaseDiceShopItem,
  type DiceShopItem,
} from "../../../core/domain/shop";

export type DiceShopAction =
  | {
      type: "buy";
      ownerId: string;
      itemId: string;
    }
  | {
      type: "refresh";
      ownerId: string;
    };

export type DiceShopResult = ActionResult<DiceShopAction>;

export const createDiceShopReply = (db: SqliteDatabase, userId: string): DiceShopResult => {
  return {
    kind: "reply",
    payload: {
      type: "view",
      view: buildShopView(db, userId),
      ephemeral: false,
    },
  };
};

export const handleDiceShopAction = (
  db: SqliteDatabase,
  actorId: string,
  action: DiceShopAction,
): DiceShopResult => {
  if (actorId !== action.ownerId) {
    return {
      kind: "reply",
      payload: {
        type: "message",
        content: "This shop menu is not assigned to you.",
        ephemeral: true,
      },
    };
  }

  if (action.type === "refresh") {
    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildShopView(db, action.ownerId),
      },
    };
  }

  const purchase = purchaseDiceShopItem(db, {
    userId: action.ownerId,
    itemId: action.itemId,
  });
  if (!purchase.ok) {
    if (purchase.reason === "insufficient-pips") {
      return {
        kind: "reply",
        payload: {
          type: "message",
          content: `You need ${purchase.requiredPips} pips to buy ${purchase.item.name}. Current balance: ${purchase.currentPips} pips.`,
          ephemeral: true,
        },
      };
    }

    return {
      kind: "reply",
      payload: {
        type: "message",
        content: "That shop item does not exist.",
        ephemeral: true,
      },
    };
  }

  return {
    kind: "update",
    payload: {
      type: "view",
      view: buildShopView(
        db,
        action.ownerId,
        `Purchased ${purchase.item.name}. Remaining pips: ${purchase.remainingPips}. Owned: ${purchase.quantity}.`,
      ),
    },
  };
};

const buildShopView = (db: SqliteDatabase, userId: string, statusLine?: string): ActionView<DiceShopAction> => {
  return {
    content: buildShopContent(db, userId, statusLine),
    components: buildShopComponents(userId),
  };
};

const buildShopContent = (db: SqliteDatabase, userId: string, statusLine?: string): string => {
  const economy = getEconomySnapshot(db, userId);
  const inventoryQuantities = getInventoryQuantities(db, userId);
  const lines: string[] = [];

  if (statusLine) {
    lines.push(statusLine, "");
  }

  lines.push(
    `Dice shop for <@${userId}>:`,
    `Pips: ${economy.pips}.`,
    "Spend pips on inventory items.",
    "",
  );

  for (const item of getDiceShopItems()) {
    lines.push(...buildItemLines(item, inventoryQuantities.get(item.id) ?? 0), "");
  }

  return lines.slice(0, -1).join("\n");
};

const buildItemLines = (item: DiceShopItem, ownedQuantity: number): string[] => {
  return [
    `**${item.name}**`,
    `Cost: ${item.pricePips} pips.`,
    `Owned: ${ownedQuantity}.`,
    item.description,
  ];
};

const buildShopComponents = (userId: string): ActionView<DiceShopAction>["components"] => {
  const purchaseButtons = getDiceShopItems().map((item) => ({
    action: {
      type: "buy",
      ownerId: userId,
      itemId: item.id,
    } as const,
    label: `Buy ${item.name} (${item.pricePips})`,
    style: "success" as const,
  }));

  const rows: ActionView<DiceShopAction>["components"] = [];
  for (let index = 0; index < purchaseButtons.length; index += 5) {
    rows.push(purchaseButtons.slice(index, index + 5));
  }

  rows.push([
    {
      action: { type: "refresh", ownerId: userId },
      label: "Refresh",
      style: "secondary",
    },
  ]);

  return rows;
};
