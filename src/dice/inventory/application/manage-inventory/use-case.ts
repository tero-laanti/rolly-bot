import {
  chunkActionButtons,
  maxActionButtonsPerRow,
  type ActionResult,
  type ActionView,
} from "../../../../shared-kernel/application/action-view";
import type { AchievementAnnouncement } from "../../../progression/application/achievement-announcements";
import {
  type UseDiceItemResult,
  type ReserveAutoRollSession,
  type TriggerRandomGroupEvent,
} from "../use-item/use-case";
import type { DiceInventoryEntry } from "../../../inventory/domain/shop";
import type {
  AutoRollSessionReservation,
  DiceInventoryRepository,
  DicePermanentBonuses,
  DicePermanentBonusesPort,
} from "../ports";
import { getItemOwnershipLabel } from "../../domain/passive-items";
import {
  discordActionRowLimit,
  discordMessageCharacterLimit,
  truncateDiscordText,
} from "../../../../shared/discord";

export type DiceInventoryAction =
  | {
      type: "use";
      ownerId: string;
      itemId: string;
      page: number;
    }
  | {
      type: "refresh";
      ownerId: string;
      page: number;
    }
  | {
      type: "page";
      ownerId: string;
      page: number;
    };

export type DiceInventoryResult = ActionResult<DiceInventoryAction>;

export type DiceInventoryActionOutcome = {
  result: DiceInventoryResult;
  achievementAnnouncements?: AchievementAnnouncement[];
  autoRollStart?:
    | {
        reservation: AutoRollSessionReservation;
        itemId: string;
      }
    | undefined;
};

type ManageInventoryDependencies = {
  inventory: Pick<DiceInventoryRepository, "getOwnedInventoryEntries">;
  permanentBonuses: Pick<DicePermanentBonusesPort, "getPermanentBonuses">;
  useDiceItem: (input: {
    userId: string;
    itemId: string;
    reserveAutoRollSession: ReserveAutoRollSession;
    triggerRandomGroupEvent: TriggerRandomGroupEvent;
  }) => Promise<UseDiceItemResult>;
};

export const createDiceInventoryUseCase = ({
  inventory,
  permanentBonuses,
  useDiceItem,
}: ManageInventoryDependencies) => {
  const createDiceInventoryReply = (userId: string): DiceInventoryResult => {
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildInventoryView(inventory, permanentBonuses, userId),
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
            view: buildInventoryView(
              inventory,
              permanentBonuses,
              action.ownerId,
              undefined,
              action.page,
            ),
          },
        },
      };
    }

    if (action.type === "page") {
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildInventoryView(
              inventory,
              permanentBonuses,
              action.ownerId,
              undefined,
              action.page,
            ),
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
        achievementAnnouncements: useResult.achievementAnnouncements,
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
          view: buildInventoryView(
            inventory,
            permanentBonuses,
            action.ownerId,
            useResult.statusMessage,
            action.page,
          ),
        },
      },
      achievementAnnouncements: useResult.achievementAnnouncements,
    };
  };

  return {
    createDiceInventoryReply,
    handleDiceInventoryAction,
  };
};

const buildInventoryView = (
  inventory: Pick<DiceInventoryRepository, "getOwnedInventoryEntries">,
  permanentBonuses: Pick<DicePermanentBonusesPort, "getPermanentBonuses">,
  userId: string,
  statusLine?: string,
  requestedPage: number = 0,
): ActionView<DiceInventoryAction> => {
  const entries = inventory.getOwnedInventoryEntries(userId);
  const bonusLines = buildPermanentBonusLines(permanentBonuses.getPermanentBonuses(userId));
  const pages = paginateInventoryEntries(entries, userId, statusLine, bonusLines, false);
  const normalizedPages =
    pages.length > 1
      ? paginateInventoryEntries(entries, userId, statusLine, bonusLines, true)
      : pages;
  const totalPages = Math.max(1, normalizedPages.length);
  const currentPage = clampPage(requestedPage, totalPages);
  const pageEntries = normalizedPages[currentPage] ?? [];

  return {
    content: buildInventoryContent(
      userId,
      pageEntries,
      statusLine,
      bonusLines,
      currentPage,
      totalPages,
    ),
    components: buildInventoryComponents(userId, pageEntries, currentPage, totalPages),
  };
};

const buildInventoryContent = (
  userId: string,
  entries: DiceInventoryEntry[],
  statusLine?: string,
  bonusLines: string[] = [],
  currentPage: number = 0,
  totalPages: number = 1,
): string => {
  const headerLines = [`Dice inventory for <@${userId}>:`];

  if (entries.length === 0) {
    const sections: string[] = [];
    if (statusLine) {
      sections.push(statusLine);
    }
    headerLines.push("Inventory is empty.", "Buy items with /shop.");
    sections.push(headerLines.join("\n"));
    return truncateDiscordText(sections.join("\n\n"), discordMessageCharacterLimit);
  }

  headerLines.push("Use buttons below to consume items.");
  if (bonusLines.length > 0) {
    headerLines.push("", ...bonusLines);
  }
  if (totalPages > 1) {
    headerLines.push(`Page ${currentPage + 1}/${totalPages}.`);
  }
  const bodySections = [
    headerLines.join("\n"),
    ...entries.map((entry) =>
      [
        `**${entry.item.name}**`,
        `Owned: ${entry.quantity}.`,
        entry.item.description,
        getItemOwnershipLabel(entry.item),
      ].join("\n"),
    ),
  ];
  const bodyContent = bodySections.join("\n\n");
  if (!statusLine) {
    return bodyContent;
  }

  const fullContent = [statusLine, bodyContent].join("\n\n");
  if (fullContent.length <= discordMessageCharacterLimit) {
    return fullContent;
  }

  const availableStatusLength = discordMessageCharacterLimit - bodyContent.length - 2;
  if (availableStatusLength <= 0) {
    return bodyContent;
  }

  return [truncateDiscordText(statusLine, availableStatusLength), bodyContent].join("\n\n");
};

const buildInventoryComponents = (
  userId: string,
  entries: DiceInventoryEntry[],
  currentPage: number,
  totalPages: number,
): ActionView<DiceInventoryAction>["components"] => {
  const useButtons = entries
    .filter((entry) => entry.item.consumable)
    .map((entry) => ({
      action: {
        type: "use",
        ownerId: userId,
        itemId: entry.item.id,
        page: currentPage,
      } as const,
      label: `Use ${entry.item.name}`,
      style: "primary" as const,
    }));

  const navigationButtons = [
    ...(currentPage > 0
      ? [
          {
            action: { type: "page", ownerId: userId, page: currentPage - 1 } as const,
            label: "←",
            style: "secondary" as const,
          },
        ]
      : []),
    {
      action: { type: "refresh", ownerId: userId, page: currentPage } as const,
      label: "Refresh",
      style: "secondary" as const,
    },
    ...(currentPage + 1 < totalPages
      ? [
          {
            action: { type: "page", ownerId: userId, page: currentPage + 1 } as const,
            label: "→",
            style: "secondary" as const,
          },
        ]
      : []),
  ];

  return [...chunkActionButtons(useButtons), navigationButtons];
};

const inventoryUseButtonLimit = (discordActionRowLimit - 1) * maxActionButtonsPerRow;

const paginateInventoryEntries = (
  entries: DiceInventoryEntry[],
  userId: string,
  statusLine: string | undefined,
  bonusLines: string[],
  includePageIndicator: boolean,
): DiceInventoryEntry[][] => {
  if (entries.length < 1) {
    return [[]];
  }

  const pages: DiceInventoryEntry[][] = [];
  let currentPageEntries: DiceInventoryEntry[] = [];
  let currentConsumableCount = 0;

  for (const entry of entries) {
    const candidateEntries = [...currentPageEntries, entry];
    const candidateConsumableCount = currentConsumableCount + (entry.item.consumable ? 1 : 0);
    const candidateContent = buildInventoryContent(
      userId,
      candidateEntries,
      statusLine,
      bonusLines,
      0,
      includePageIndicator ? 99 : 1,
    );
    const exceedsPageBudget =
      candidateConsumableCount > inventoryUseButtonLimit ||
      candidateContent.length > discordMessageCharacterLimit;

    if (currentPageEntries.length > 0 && exceedsPageBudget) {
      pages.push(currentPageEntries);
      currentPageEntries = [entry];
      currentConsumableCount = entry.item.consumable ? 1 : 0;
      continue;
    }

    currentPageEntries = candidateEntries;
    currentConsumableCount = candidateConsumableCount;
  }

  if (currentPageEntries.length > 0) {
    pages.push(currentPageEntries);
  }

  return pages;
};

const buildPermanentBonusLines = (bonuses: DicePermanentBonuses): string[] => {
  const lines = ["Permanent bonuses:"];
  const details: string[] = [];

  if (bonuses.extraBanSlots > 0) {
    details.push(`Extra ban slots: +${bonuses.extraBanSlots}.`);
  }

  if (bonuses.pipRewardBonusPercent > 0) {
    details.push(`Pip rewards: +${bonuses.pipRewardBonusPercent}%.`);
  }

  if (bonuses.personalCharge.unlocked) {
    details.push(
      `Personal Dice charge: +1 every ${formatCompactNumber(bonuses.personalCharge.minutesPerMultiplier)} min, up to x${bonuses.personalCharge.maxMultiplier}.`,
    );
  }

  if (details.length < 1) {
    details.push("None yet.");
  }

  return [...lines, ...details];
};

const formatCompactNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value
    .toFixed(2)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
};

const clampPage = (page: number, totalPages: number): number => {
  if (!Number.isInteger(page)) {
    return 0;
  }

  return Math.max(0, Math.min(totalPages - 1, page));
};
