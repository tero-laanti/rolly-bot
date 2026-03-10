import type { SqliteDatabase } from "../../../../shared/db";
import { getFame } from "../../../economy/domain/balance";
import {
  clearDiceBan,
  clearSingleDiceBan,
  getDiceBans,
  getMaxBansPerDie,
  getUnlockedBanSlotsFromFame,
  setDiceBan,
} from "../../../progression/domain/bans";
import { getDiceLevel, getDiceSides } from "../../../progression/domain/prestige";
import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";

const numbersPerRow = 5;
const numberRowsPerPage = 4;
const numbersPerPage = numbersPerRow * numberRowsPerPage;

export type DiceBansAction =
  | {
      type: "back";
      ownerId: string;
    }
  | {
      type: "close";
      ownerId: string;
    }
  | {
      type: "clear-bans";
      ownerId: string;
    }
  | {
      type: "die";
      ownerId: string;
      dieIndex: number;
    }
  | {
      type: "page";
      ownerId: string;
      dieIndex: number;
      page: number;
    }
  | {
      type: "ban";
      ownerId: string;
      dieIndex: number;
      value: number;
      page: number;
    };

export type DiceBansResult = ActionResult<DiceBansAction>;

export const createDiceBansReply = (db: SqliteDatabase, userId: string): DiceBansResult => {
  const diceLevel = getDiceLevel(db, userId);
  const dieSides = getDiceSides(db, userId);
  const fame = getFame(db, userId);
  const bans = getDiceBans(db, userId);
  const unlockedSlots = getUnlockedBanSlotsFromFame(fame, diceLevel, dieSides);
  const usedCount = countUsedBans(bans);

  if (unlockedSlots < 1 && usedCount === 0) {
    return {
      kind: "reply",
      payload: {
        type: "message",
        content: "You need 3 fame to unlock your first ban slot.",
        ephemeral: false,
      },
    };
  }

  return {
    kind: "reply",
    payload: {
      type: "view",
      view: buildDieSelectionView(userId, diceLevel, bans, unlockedSlots),
      ephemeral: false,
    },
  };
};

export const handleDiceBansAction = (
  db: SqliteDatabase,
  actorId: string,
  action: DiceBansAction,
): DiceBansResult => {
  if (actorId !== action.ownerId) {
    return {
      kind: "reply",
      payload: {
        type: "message",
        content: "This ban menu is not assigned to you.",
        ephemeral: true,
      },
    };
  }

  const diceLevel = getDiceLevel(db, action.ownerId);
  const dieSides = getDiceSides(db, action.ownerId);
  const fame = getFame(db, action.ownerId);
  const unlockedSlots = getUnlockedBanSlotsFromFame(fame, diceLevel, dieSides);

  if (action.type === "back") {
    const bans = getDiceBans(db, action.ownerId);
    const usedCount = countUsedBans(bans);
    if (unlockedSlots < 1 && usedCount === 0) {
      return {
        kind: "update",
        payload: {
          type: "message",
          content: "You need 3 fame to unlock your first ban slot.",
          clearComponents: true,
        },
      };
    }

    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildDieSelectionView(action.ownerId, diceLevel, bans, unlockedSlots),
      },
    };
  }

  if (action.type === "close") {
    return {
      kind: "update",
      payload: {
        type: "message",
        content: "Dice ban menu closed.",
        clearComponents: true,
      },
    };
  }

  if (action.type === "clear-bans") {
    const bans = getDiceBans(db, action.ownerId);
    for (const [dieIndex, bannedSides] of bans) {
      if (bannedSides.size > 0) {
        clearDiceBan(db, action.ownerId, dieIndex);
      }
    }

    const updatedBans = getDiceBans(db, action.ownerId);
    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildDieSelectionView(
          action.ownerId,
          diceLevel,
          updatedBans,
          unlockedSlots,
          "All bans cleared.",
        ),
      },
    };
  }

  if (!Number.isInteger(action.dieIndex) || action.dieIndex < 1) {
    return {
      kind: "reply",
      payload: {
        type: "message",
        content: "Invalid die selection.",
        ephemeral: true,
      },
    };
  }

  const currentBans = getDiceBans(db, action.ownerId);
  const hasBansOnSelectedDie = (currentBans.get(action.dieIndex)?.size ?? 0) > 0;
  if (action.dieIndex > diceLevel && !hasBansOnSelectedDie) {
    return {
      kind: "reply",
      payload: {
        type: "message",
        content: "You do not have that many dice.",
        ephemeral: true,
      },
    };
  }

  if (action.type === "die") {
    const bans = getDiceBans(db, action.ownerId);
    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildNumberSelectionView({
          ownerId: action.ownerId,
          dieIndex: action.dieIndex,
          bans,
          unlockedSlots,
          dieSides,
          page: 0,
        }),
      },
    };
  }

  if (action.type === "page") {
    if (!Number.isInteger(action.page)) {
      return {
        kind: "reply",
        payload: {
          type: "message",
          content: "Invalid page selection.",
          ephemeral: true,
        },
      };
    }

    const bans = getDiceBans(db, action.ownerId);
    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildNumberSelectionView({
          ownerId: action.ownerId,
          dieIndex: action.dieIndex,
          bans,
          unlockedSlots,
          dieSides,
          page: action.page,
        }),
      },
    };
  }

  if (!Number.isInteger(action.value) || action.value < 1 || action.value > dieSides) {
    return {
      kind: "reply",
      payload: {
        type: "message",
        content: `Pick a number between 1 and ${dieSides}.`,
        ephemeral: true,
      },
    };
  }

  const bansBefore = getDiceBans(db, action.ownerId);
  const bannedValuesBefore = bansBefore.get(action.dieIndex) ?? new Set<number>();
  const isUnban = bannedValuesBefore.has(action.value);
  const usedCount = countUsedBans(bansBefore);

  if (isUnban) {
    clearSingleDiceBan(db, action.ownerId, action.dieIndex, action.value);
  } else if (usedCount >= unlockedSlots) {
    return {
      kind: "reply",
      payload: {
        type: "message",
        content: "No ban slots are available. Remove a ban first.",
        ephemeral: true,
      },
    };
  } else if (bannedValuesBefore.size >= getMaxBansPerDie(dieSides)) {
    return {
      kind: "reply",
      payload: {
        type: "message",
        content: "That die is fully locked.",
        ephemeral: true,
      },
    };
  } else {
    setDiceBan(db, { userId: action.ownerId, dieIndex: action.dieIndex, bannedValue: action.value });
  }

  const bans = getDiceBans(db, action.ownerId);
  const confirmation = isUnban
    ? `Ban removed: ${action.value} from die ${action.dieIndex}.`
    : `Ban applied: ${action.value} on die ${action.dieIndex}.`;

  return {
    kind: "update",
    payload: {
      type: "view",
      view: buildNumberSelectionView({
        ownerId: action.ownerId,
        dieIndex: action.dieIndex,
        bans,
        unlockedSlots,
        dieSides,
        page: action.page,
        confirmation,
      }),
    },
  };
};

const buildDieSelectionView = (
  ownerId: string,
  diceLevel: number,
  bans: Map<number, Set<number>>,
  unlockedSlots: number,
  prefixMessage?: string,
): ActionView<DiceBansAction> => {
  const hasAnyBans = countUsedBans(bans) > 0;
  const banDieIndexes = Array.from(bans.entries())
    .filter(([, values]) => values.size > 0)
    .map(([dieIndex]) => dieIndex);
  const maxVisibleDieIndex = Math.max(diceLevel, ...banDieIndexes, 0);
  const dieButtons = Array.from({ length: maxVisibleDieIndex }, (_, index) => {
    const dieIndex = index + 1;
    const banCount = bans.get(dieIndex)?.size ?? 0;
    const hasBan = banCount > 0;
    const label = banCount > 0 ? `Die ${dieIndex} (${banCount})` : `Die ${dieIndex}`;

    return {
      action: { type: "die", ownerId, dieIndex } as const,
      label,
      style: hasBan ? ("success" as const) : ("primary" as const),
    };
  });

  const contentSections = [
    prefixMessage,
    buildDieSelectionContent({ bans, unlockedSlots }),
  ].filter((section): section is string => Boolean(section));

  return {
    content: contentSections.join("\n"),
    components: [
      ...chunkButtons(dieButtons),
      [
        {
          action: { type: "close", ownerId },
          label: "Close",
          style: "secondary",
        },
        {
          action: { type: "clear-bans", ownerId },
          label: "Clear bans",
          style: "danger",
          disabled: !hasAnyBans,
        },
      ],
    ],
  };
};

type NumberSelectionViewInput = {
  ownerId: string;
  dieIndex: number;
  bans: Map<number, Set<number>>;
  unlockedSlots: number;
  dieSides: number;
  page: number;
  confirmation?: string;
};

const buildNumberSelectionView = ({
  ownerId,
  dieIndex,
  bans,
  unlockedSlots,
  dieSides,
  page,
  confirmation,
}: NumberSelectionViewInput): ActionView<DiceBansAction> => {
  const bannedValues = bans.get(dieIndex) ?? new Set<number>();
  const usedCount = countUsedBans(bans);
  const totalPages = getNumberPageCount(dieSides);
  const currentPage = clampPage(page, totalPages);
  const startValue = currentPage * numbersPerPage + 1;
  const endValue = Math.min(dieSides, startValue + numbersPerPage - 1);
  const numberButtons = Array.from({ length: endValue - startValue + 1 }, (_, index) => {
    const value = startValue + index;
    const isBanned = bannedValues.has(value);
    const noSlotsLeft = usedCount >= unlockedSlots;
    const dieAtLimit = bannedValues.size >= getMaxBansPerDie(dieSides);
    const shouldDisable = !isBanned && (noSlotsLeft || dieAtLimit);

    return {
      action: { type: "ban", ownerId, dieIndex, value, page: currentPage } as const,
      label: `${value}`,
      style: isBanned ? ("danger" as const) : ("primary" as const),
      disabled: shouldDisable,
    };
  });

  const navigationButtons = [];
  if (totalPages > 1) {
    navigationButtons.push(
      {
        action: { type: "page", ownerId, dieIndex, page: currentPage - 1 } as const,
        label: "Prev",
        style: "secondary" as const,
        disabled: currentPage <= 0,
      },
      {
        action: { type: "page", ownerId, dieIndex, page: currentPage + 1 } as const,
        label: "Next",
        style: "secondary" as const,
        disabled: currentPage >= totalPages - 1,
      },
    );
  }

  navigationButtons.push(
    {
      action: { type: "back", ownerId } as const,
      label: "Back",
      style: "secondary" as const,
    },
    {
      action: { type: "close", ownerId } as const,
      label: "Close",
      style: "secondary" as const,
    },
  );

  return {
    content: buildNumberSelectionContent({
      bans,
      unlockedSlots,
      confirmation,
      dieSides,
      page: currentPage,
    }),
    components: [...chunkButtons(numberButtons), navigationButtons],
  };
};

type DieSelectionContent = {
  bans: Map<number, Set<number>>;
  unlockedSlots: number;
};

type NumberSelectionContent = {
  bans: Map<number, Set<number>>;
  confirmation?: string;
  dieSides: number;
  page: number;
  unlockedSlots: number;
};

const buildDieSelectionContent = ({ bans, unlockedSlots }: DieSelectionContent): string => {
  const usedCount = countUsedBans(bans);
  const summary = formatBansSummary(bans);
  return [
    `Bans: ${usedCount}/${unlockedSlots} used.`,
    summary,
    "\nSelect a die to configure.",
  ].join("\n");
};

const buildNumberSelectionContent = ({
  bans,
  unlockedSlots,
  confirmation,
  dieSides,
  page,
}: NumberSelectionContent): string => {
  const usedCount = countUsedBans(bans);
  const summary = formatBansSummary(bans);
  const totalPages = getNumberPageCount(dieSides);
  const currentPage = clampPage(page, totalPages);
  const lines = [
    confirmation,
    "Choose a number to ban.",
    totalPages > 1 ? `Page ${currentPage + 1}/${totalPages}.` : null,
    `Bans: ${usedCount}/${unlockedSlots} used.`,
    summary,
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
};

const formatBansSummary = (bans: Map<number, Set<number>>): string => {
  const entries = Array.from(bans.entries())
    .filter(([, values]) => values.size > 0)
    .sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) {
    return "Current bans: none.";
  }

  const parts = entries.map(([dieIndex, values]) => {
    const list = Array.from(values.values()).sort((a, b) => a - b);
    return `Die ${dieIndex}: ${list.join(", ")}`;
  });
  return `Current bans: ${parts.join(", ")}.`;
};

const countUsedBans = (bans: Map<number, Set<number>>): number => {
  let count = 0;
  for (const values of bans.values()) {
    count += values.size;
  }
  return count;
};

const chunkButtons = <TAction>(
  buttons: ActionView<TAction>["components"][number],
): ActionView<TAction>["components"] => {
  const rows: ActionView<TAction>["components"] = [];
  for (let index = 0; index < buttons.length; index += numbersPerRow) {
    rows.push(buttons.slice(index, index + numbersPerRow));
  }
  return rows;
};

const getNumberPageCount = (dieSides: number): number => {
  return Math.max(1, Math.ceil(dieSides / numbersPerPage));
};

const clampPage = (page: number, totalPages: number): number => {
  if (!Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.floor(page)), totalPages - 1);
};
