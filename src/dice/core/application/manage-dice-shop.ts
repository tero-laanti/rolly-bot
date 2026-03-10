import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { SqliteDatabase } from "../../../shared/db";
import type { InteractionResult } from "../../../bot/interaction-response";
import { getEconomySnapshot } from "../../../shared/economy";
import {
  getDiceShopItems,
  getInventoryQuantities,
  purchaseDiceShopItem,
  type DiceShopItem,
  type DiceShopItemId,
} from "../domain/shop";

export const diceShopButtonPrefix = "dice-shop:";

type DiceShopView = {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
};

type DiceShopButtonId =
  | {
      action: "buy";
      ownerId: string;
      itemId: string;
    }
  | {
      action: "refresh";
      ownerId: string;
    };

export const createDiceShopReply = (
  db: SqliteDatabase,
  userId: string,
): InteractionResult => {
  return {
    kind: "reply",
    payload: {
      ...buildShopView(db, userId),
      ephemeral: false,
    },
  };
};

export const handleDiceShopAction = (
  db: SqliteDatabase,
  actorId: string,
  customId: string,
): InteractionResult => {
  const parsed = parseDiceShopButtonId(customId);
  if (!parsed) {
    return {
      kind: "reply",
      payload: {
        content: "Unknown shop action.",
        ephemeral: true,
      },
    };
  }

  if (actorId !== parsed.ownerId) {
    return {
      kind: "reply",
      payload: {
        content: "This shop menu is not assigned to you.",
        ephemeral: true,
      },
    };
  }

  if (parsed.action === "refresh") {
    return {
      kind: "update",
      payload: buildShopView(db, parsed.ownerId),
    };
  }

  const purchase = purchaseDiceShopItem(db, {
    userId: parsed.ownerId,
    itemId: parsed.itemId,
  });
  if (!purchase.ok) {
    if (purchase.reason === "insufficient-pips") {
      return {
        kind: "reply",
        payload: {
          content: `You need ${purchase.requiredPips} pips to buy ${purchase.item.name}. Current balance: ${purchase.currentPips} pips.`,
          ephemeral: true,
        },
      };
    }

    return {
      kind: "reply",
      payload: {
        content: "That shop item does not exist.",
        ephemeral: true,
      },
    };
  }

  return {
    kind: "update",
    payload: buildShopView(
      db,
      parsed.ownerId,
      `Purchased ${purchase.item.name}. Remaining pips: ${purchase.remainingPips}. Owned: ${purchase.quantity}.`,
    ),
  };
};

const buildShopView = (
  db: SqliteDatabase,
  userId: string,
  statusLine?: string,
): DiceShopView => {
  return {
    content: buildShopContent(db, userId, statusLine),
    components: buildShopComponents(userId),
  };
};

const buildShopContent = (
  db: SqliteDatabase,
  userId: string,
  statusLine?: string,
): string => {
  const economy = getEconomySnapshot(db, userId);
  const inventoryQuantities = getInventoryQuantities(db, userId);
  const lines: string[] = [];

  if (statusLine) {
    lines.push(statusLine, "");
  }

  lines.push(
    `Dice shop for <@${userId}>:`,
    `Pips: ${economy.pips}.`,
    "Spend pips on permanent inventory items.",
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

const buildShopComponents = (userId: string): ActionRowBuilder<ButtonBuilder>[] => {
  const purchaseButtons = getDiceShopItems().map((item) =>
    new ButtonBuilder()
      .setCustomId(buildBuyButtonId(userId, item.id))
      .setLabel(`Buy ${item.name} (${item.pricePips})`)
      .setStyle(ButtonStyle.Success),
  );

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...purchaseButtons),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildRefreshButtonId(userId))
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
};

const buildBuyButtonId = (userId: string, itemId: DiceShopItemId): string => {
  return `${diceShopButtonPrefix}buy:${userId}:${itemId}`;
};

const buildRefreshButtonId = (userId: string): string => {
  return `${diceShopButtonPrefix}refresh:${userId}`;
};

const parseDiceShopButtonId = (customId: string): DiceShopButtonId | null => {
  if (!customId.startsWith(diceShopButtonPrefix)) {
    return null;
  }

  const [actionRaw, ownerId, itemId] = customId.slice(diceShopButtonPrefix.length).split(":");
  if (!actionRaw || !ownerId) {
    return null;
  }

  if (actionRaw === "buy") {
    if (!itemId) {
      return null;
    }

    return {
      action: "buy",
      ownerId,
      itemId,
    };
  }

  if (actionRaw === "refresh") {
    return {
      action: "refresh",
      ownerId,
    };
  }

  return null;
};
