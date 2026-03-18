import {
  chunkActionButtons,
  type ActionResult,
  type ActionView,
} from "../../../../shared-kernel/application/action-view";
import {
  type UseDiceItemResult,
  type ReserveAutoRollSession,
  type TriggerRandomGroupEvent,
} from "../use-item/use-case";
import type { DiceInventoryEntry } from "../../../inventory/domain/shop";
import type { AutoRollSessionReservation, DiceInventoryRepository } from "../ports";

export type DiceInventoryAction =
  | {
      type: "use";
      ownerId: string;
      itemId: string;
    }
  | {
      type: "refresh";
      ownerId: string;
    };

export type DiceInventoryResult = ActionResult<DiceInventoryAction>;

export type DiceInventoryActionOutcome = {
  result: DiceInventoryResult;
  autoRollStart?:
    | {
        reservation: AutoRollSessionReservation;
        itemId: string;
      }
    | undefined;
};

type ManageInventoryDependencies = {
  inventory: Pick<DiceInventoryRepository, "getOwnedInventoryEntries">;
  useDiceItem: (input: {
    userId: string;
    itemId: string;
    reserveAutoRollSession: ReserveAutoRollSession;
    triggerRandomGroupEvent: TriggerRandomGroupEvent;
  }) => Promise<UseDiceItemResult>;
};

export const createDiceInventoryUseCase = ({
  inventory,
  useDiceItem,
}: ManageInventoryDependencies) => {
  const createDiceInventoryReply = (userId: string): DiceInventoryResult => {
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildInventoryView(inventory, userId),
        ephemeral: false,
      },
    };
  };

  const handleDiceInventoryAction = async (
    actorId: string,
    action: DiceInventoryAction,
    options: {
      reserveAutoRollSession: ReserveAutoRollSession;
      triggerRandomGroupEvent: TriggerRandomGroupEvent;
    },
  ): Promise<DiceInventoryActionOutcome> => {
    if (actorId !== action.ownerId) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: "This inventory menu is not assigned to you.",
            ephemeral: true,
          },
        },
      };
    }

    if (action.type === "refresh") {
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildInventoryView(inventory, action.ownerId),
          },
        },
      };
    }

    const useResult = await useDiceItem({
      userId: action.ownerId,
      itemId: action.itemId,
      reserveAutoRollSession: options.reserveAutoRollSession,
      triggerRandomGroupEvent: options.triggerRandomGroupEvent,
    });
    if (!useResult.ok) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: useResult.message,
            ephemeral: true,
          },
        },
      };
    }

    if (useResult.autoRollReservation) {
      return {
        result: {
          kind: "update",
          payload: {
            type: "message",
            content: `${useResult.item.name} engaged.`,
            clearComponents: true,
          },
        },
        autoRollStart: {
          reservation: useResult.autoRollReservation,
          itemId: useResult.item.id,
        },
      };
    }

    return {
      result: {
        kind: "update",
        payload: {
          type: "view",
          view: buildInventoryView(inventory, action.ownerId, useResult.statusMessage),
        },
      },
    };
  };

  return {
    createDiceInventoryReply,
    handleDiceInventoryAction,
  };
};

const buildInventoryView = (
  inventory: Pick<DiceInventoryRepository, "getOwnedInventoryEntries">,
  userId: string,
  statusLine?: string,
): ActionView<DiceInventoryAction> => {
  const entries = inventory.getOwnedInventoryEntries(userId);

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
  const sections: string[] = [];

  if (statusLine) {
    sections.push(statusLine);
  }

  if (entries.length === 0) {
    sections.push(`Dice inventory for <@${userId}>:\nInventory is empty.\nBuy items with /dice-shop.`);
    return sections.join("\n\n");
  }

  sections.push(`Dice inventory for <@${userId}>:\nUse buttons below to consume items.`);
  sections.push(
    ...entries.map((entry) =>
      [
        `**${entry.item.name}**`,
        `Owned: ${entry.quantity}.`,
        entry.item.description,
        entry.item.consumable ? "Consumable." : "Permanent collectible.",
      ].join("\n"),
    ),
  );

  return sections.join("\n\n");
};

const buildInventoryComponents = (
  userId: string,
  entries: DiceInventoryEntry[],
): ActionView<DiceInventoryAction>["components"] => {
  const useButtons = entries
    .filter((entry) => entry.item.consumable)
    .map((entry) => ({
      action: {
        type: "use",
        ownerId: userId,
        itemId: entry.item.id,
      } as const,
      label: `Use ${entry.item.name}`,
      style: "primary" as const,
    }));

  return [
    ...chunkActionButtons(useButtons),
    [
      {
        action: { type: "refresh", ownerId: userId },
        label: "Refresh",
        style: "secondary",
      },
    ],
  ];
};
