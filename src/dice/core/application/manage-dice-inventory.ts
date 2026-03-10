import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { SqliteDatabase } from "../../../shared/db";
import type { InteractionResult } from "../../../bot/interaction-response";
import {
  buildAutoRollSessionStartingContent,
  type AutoRollSessionReservation,
} from "../../features/auto-roller/runtime";
import { useDiceItem, type ReserveAutoRollSession } from "./use-dice-item";
import {
  getOwnedInventoryEntries,
  type DiceInventoryEntry,
  type DiceShopItemId,
} from "../domain/shop";

export const diceInventoryButtonPrefix = "dice-inventory:";

type DiceInventoryView = {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
};

type DiceInventoryButtonId =
  | {
      action: "use";
      ownerId: string;
      itemId: string;
    }
  | {
      action: "refresh";
      ownerId: string;
    };

export type DiceInventoryActionOutcome = {
  interactionResult: InteractionResult;
  autoRollStart?:
    | {
        reservation: AutoRollSessionReservation;
        itemId: string;
      }
    | undefined;
};

export const createDiceInventoryReply = (db: SqliteDatabase, userId: string): InteractionResult => {
  return {
    kind: "reply",
    payload: {
      ...buildInventoryView(db, userId),
      ephemeral: false,
    },
  };
};

export const handleDiceInventoryAction = async (
  db: SqliteDatabase,
  actorId: string,
  customId: string,
  { reserveAutoRollSession }: { reserveAutoRollSession: ReserveAutoRollSession },
): Promise<DiceInventoryActionOutcome> => {
  const parsed = parseDiceInventoryButtonId(customId);
  if (!parsed) {
    return {
      interactionResult: {
        kind: "reply",
        payload: {
          content: "Unknown inventory action.",
          ephemeral: true,
        },
      },
    };
  }

  if (actorId !== parsed.ownerId) {
    return {
      interactionResult: {
        kind: "reply",
        payload: {
          content: "This inventory menu is not assigned to you.",
          ephemeral: true,
        },
      },
    };
  }

  if (parsed.action === "refresh") {
    return {
      interactionResult: {
        kind: "update",
        payload: buildInventoryView(db, parsed.ownerId),
      },
    };
  }

  const useResult = await useDiceItem(db, {
    userId: parsed.ownerId,
    itemId: parsed.itemId,
    reserveAutoRollSession,
  });
  if (!useResult.ok) {
    return {
      interactionResult: {
        kind: "reply",
        payload: {
          content: useResult.message,
          ephemeral: true,
        },
      },
    };
  }

  if (useResult.autoRollReservation) {
    return {
      interactionResult: {
        kind: "update",
        payload: {
          content: buildAutoRollSessionStartingContent(useResult.autoRollReservation),
          components: [],
        },
      },
      autoRollStart: {
        reservation: useResult.autoRollReservation,
        itemId: useResult.item.id,
      },
    };
  }

  return {
    interactionResult: {
      kind: "update",
      payload: buildInventoryView(db, parsed.ownerId, useResult.statusMessage),
    },
  };
};

const buildInventoryView = (
  db: SqliteDatabase,
  userId: string,
  statusLine?: string,
): DiceInventoryView => {
  const entries = getOwnedInventoryEntries(db, userId);

  return {
    content: buildInventoryContent(userId, entries, statusLine),
    components: buildInventoryComponents(userId, entries),
  };
};

const buildInventoryContent = (
  userId: string,
  entries: DiceInventoryEntry[],
  statusLine?: string,
): string => {
  const lines: string[] = [];

  if (statusLine) {
    lines.push(statusLine, "");
  }

  lines.push(`Dice inventory for <@${userId}>:`);

  if (entries.length === 0) {
    lines.push("Inventory is empty.", "Buy items with /dice-shop.");
    return lines.join("\n");
  }

  lines.push("Use buttons below to consume items.", "");
  for (const entry of entries) {
    lines.push(
      `**${entry.item.name}**`,
      `Owned: ${entry.quantity}.`,
      entry.item.description,
      entry.item.consumable ? "Consumable." : "Permanent collectible.",
      "",
    );
  }

  return lines.slice(0, -1).join("\n");
};

const buildInventoryComponents = (
  userId: string,
  entries: DiceInventoryEntry[],
): ActionRowBuilder<ButtonBuilder>[] => {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  const useButtons = entries
    .filter((entry) => entry.item.consumable)
    .map((entry) =>
      new ButtonBuilder()
        .setCustomId(buildUseButtonId(userId, entry.item.id))
        .setLabel(`Use ${entry.item.name}`)
        .setStyle(ButtonStyle.Primary),
    );

  for (let index = 0; index < useButtons.length; index += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(...useButtons.slice(index, index + 5)),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildRefreshButtonId(userId))
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
};

const buildUseButtonId = (userId: string, itemId: DiceShopItemId): string => {
  return `${diceInventoryButtonPrefix}use:${userId}:${itemId}`;
};

const buildRefreshButtonId = (userId: string): string => {
  return `${diceInventoryButtonPrefix}refresh:${userId}`;
};

const parseDiceInventoryButtonId = (customId: string): DiceInventoryButtonId | null => {
  if (!customId.startsWith(diceInventoryButtonPrefix)) {
    return null;
  }

  const [actionRaw, ownerId, itemId] = customId.slice(diceInventoryButtonPrefix.length).split(":");
  if (!actionRaw || !ownerId) {
    return null;
  }

  if (actionRaw === "use") {
    if (!itemId) {
      return null;
    }

    return {
      action: "use",
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
