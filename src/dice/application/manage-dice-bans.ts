import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { SqliteDatabase } from "../../shared/db";
import { getFame } from "../../shared/economy";
import type { InteractionResult } from "../../bot/interaction-response";
import {
  clearDiceBan,
  clearSingleDiceBan,
  getDiceBans,
  getMaxBansPerDie,
  getUnlockedBanSlotsFromFame,
  setDiceBan,
} from "../domain/bans";
import { getDiceLevel, getDiceSides } from "../domain/prestige";

const numbersPerRow = 5;
const numberRowsPerPage = 4;
const numbersPerPage = numbersPerRow * numberRowsPerPage;

export const diceBansButtonPrefix = "dice-bans:";

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

export const createDiceBansReply = (db: SqliteDatabase, userId: string): InteractionResult => {
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
        content: "You need 3 fame to unlock your first ban slot.",
        ephemeral: false,
      },
    };
  }

  return {
    kind: "reply",
    payload: {
      content: buildDieSelectionContent({ bans, unlockedSlots }),
      components: buildDieSelectionComponents(userId, diceLevel, bans),
      ephemeral: false,
    },
  };
};

export const handleDiceBansAction = (
  db: SqliteDatabase,
  actorId: string,
  customId: string,
): InteractionResult => {
  const [prefix, action, ownerId, dieIndexRaw, valueRaw, pageRaw] = customId.split(":");
  if (prefix !== diceBansButtonPrefix.slice(0, -1)) {
    return {
      kind: "reply",
      payload: {
        content: "Unknown ban action.",
        ephemeral: true,
      },
    };
  }

  if (actorId !== ownerId) {
    return {
      kind: "reply",
      payload: {
        content: "This ban menu is not assigned to you.",
        ephemeral: true,
      },
    };
  }

  const diceLevel = getDiceLevel(db, ownerId);
  const dieSides = getDiceSides(db, ownerId);
  const fame = getFame(db, ownerId);
  const unlockedSlots = getUnlockedBanSlotsFromFame(fame, diceLevel, dieSides);

  if (action === "back") {
    const bans = getDiceBans(db, ownerId);
    const usedCount = countUsedBans(bans);
    if (unlockedSlots < 1 && usedCount === 0) {
      return {
        kind: "update",
        payload: {
          content: "You need 3 fame to unlock your first ban slot.",
          components: [],
        },
      };
    }

    return {
      kind: "update",
      payload: {
        content: buildDieSelectionContent({ bans, unlockedSlots }),
        components: buildDieSelectionComponents(ownerId, diceLevel, bans),
      },
    };
  }

  if (action === "close") {
    return {
      kind: "update",
      payload: {
        content: "Dice ban menu closed.",
        components: [],
      },
    };
  }

  if (action === "clear-bans") {
    const bans = getDiceBans(db, ownerId);
    for (const [dieIndex, bannedSides] of bans) {
      if (bannedSides.size > 0) {
        clearDiceBan(db, ownerId, dieIndex);
      }
    }

    const updatedBans = getDiceBans(db, ownerId);
    return {
      kind: "update",
      payload: {
        content: ["All bans cleared.", buildDieSelectionContent({ bans: updatedBans, unlockedSlots })].join(
          "\n",
        ),
        components: buildDieSelectionComponents(ownerId, diceLevel, updatedBans),
      },
    };
  }

  const dieIndex = Number.parseInt(dieIndexRaw ?? "", 10);
  if (!Number.isInteger(dieIndex) || dieIndex < 1) {
    return {
      kind: "reply",
      payload: {
        content: "Invalid die selection.",
        ephemeral: true,
      },
    };
  }

  const currentBans = getDiceBans(db, ownerId);
  const hasBansOnSelectedDie = (currentBans.get(dieIndex)?.size ?? 0) > 0;
  if (dieIndex > diceLevel && !hasBansOnSelectedDie) {
    return {
      kind: "reply",
      payload: {
        content: "You do not have that many dice.",
        ephemeral: true,
      },
    };
  }

  if (action === "die") {
    const bans = getDiceBans(db, ownerId);
    const bannedValues = bans.get(dieIndex) ?? new Set<number>();
    const usedCount = countUsedBans(bans);
    const page = 0;
    return {
      kind: "update",
      payload: {
        content: buildNumberSelectionContent({
          bans,
          unlockedSlots,
          dieSides,
          page,
        }),
        components: buildNumberSelectionComponents(
          ownerId,
          dieIndex,
          bannedValues,
          usedCount,
          unlockedSlots,
          dieSides,
          page,
        ),
      },
    };
  }

  if (action === "page") {
    const page = Number.parseInt(valueRaw ?? "", 10);
    if (!Number.isInteger(page)) {
      return {
        kind: "reply",
        payload: {
          content: "Invalid page selection.",
          ephemeral: true,
        },
      };
    }

    const bans = getDiceBans(db, ownerId);
    const bannedValues = bans.get(dieIndex) ?? new Set<number>();
    const usedCount = countUsedBans(bans);
    return {
      kind: "update",
      payload: {
        content: buildNumberSelectionContent({
          bans,
          unlockedSlots,
          dieSides,
          page,
        }),
        components: buildNumberSelectionComponents(
          ownerId,
          dieIndex,
          bannedValues,
          usedCount,
          unlockedSlots,
          dieSides,
          page,
        ),
      },
    };
  }

  if (action === "ban") {
    const value = Number.parseInt(valueRaw ?? "", 10);
    if (!Number.isInteger(value) || value < 1 || value > dieSides) {
      return {
        kind: "reply",
        payload: {
          content: `Pick a number between 1 and ${dieSides}.`,
          ephemeral: true,
        },
      };
    }

    const bansBefore = getDiceBans(db, ownerId);
    const bannedValuesBefore = bansBefore.get(dieIndex) ?? new Set<number>();
    const isUnban = bannedValuesBefore.has(value);
    const usedCount = countUsedBans(bansBefore);

    if (isUnban) {
      clearSingleDiceBan(db, ownerId, dieIndex, value);
    } else if (usedCount >= unlockedSlots) {
      return {
        kind: "reply",
        payload: {
          content: "No ban slots are available. Remove a ban first.",
          ephemeral: true,
        },
      };
    } else if (bannedValuesBefore.size >= getMaxBansPerDie(dieSides)) {
      return {
        kind: "reply",
        payload: {
          content: "That die is fully locked.",
          ephemeral: true,
        },
      };
    } else {
      setDiceBan(db, { userId: ownerId, dieIndex, bannedValue: value });
    }

    const bans = getDiceBans(db, ownerId);
    const bannedValues = bans.get(dieIndex) ?? new Set<number>();
    const usedCountAfter = countUsedBans(bans);
    const confirmation = isUnban
      ? `Ban removed: ${value} from die ${dieIndex}.`
      : `Ban applied: ${value} on die ${dieIndex}.`;
    const page = Number.parseInt(pageRaw ?? "", 10);

    return {
      kind: "update",
      payload: {
        content: buildNumberSelectionContent({
          bans,
          unlockedSlots,
          confirmation,
          dieSides,
          page,
        }),
        components: buildNumberSelectionComponents(
          ownerId,
          dieIndex,
          bannedValues,
          usedCountAfter,
          unlockedSlots,
          dieSides,
          page,
        ),
      },
    };
  }

  return {
    kind: "reply",
    payload: {
      content: "Unknown ban action.",
      ephemeral: true,
    },
  };
};

const buildDieSelectionContent = ({ bans, unlockedSlots }: DieSelectionContent): string => {
  const usedCount = countUsedBans(bans);
  const summary = formatBansSummary(bans);
  return [`Bans: ${usedCount}/${unlockedSlots} used.`, summary, "\nSelect a die to configure."].join(
    "\n",
  );
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

const buildDieSelectionComponents = (
  userId: string,
  diceLevel: number,
  bans: Map<number, Set<number>>,
): ActionRowBuilder<ButtonBuilder>[] => {
  const hasAnyBans = countUsedBans(bans) > 0;
  const banDieIndexes = Array.from(bans.entries())
    .filter(([, values]) => values.size > 0)
    .map(([dieIndex]) => dieIndex);
  const maxVisibleDieIndex = Math.max(diceLevel, ...banDieIndexes, 0);
  const buttons = Array.from({ length: maxVisibleDieIndex }, (_, index) => {
    const dieIndex = index + 1;
    const banCount = bans.get(dieIndex)?.size ?? 0;
    const hasBan = banCount > 0;
    const label = banCount > 0 ? `Die ${dieIndex} (${banCount})` : `Die ${dieIndex}`;
    return new ButtonBuilder()
      .setCustomId(buildDieButtonId(userId, dieIndex))
      .setLabel(label)
      .setStyle(hasBan ? ButtonStyle.Success : ButtonStyle.Primary);
  });

  const rows = chunkButtons(buttons);
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCloseButtonId(userId))
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildClearBansButtonId(userId))
        .setLabel("Clear bans")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasAnyBans),
    ),
  );

  return rows;
};

const buildNumberSelectionComponents = (
  userId: string,
  dieIndex: number,
  bannedValues: Set<number>,
  usedCount: number,
  unlockedSlots: number,
  dieSides: number,
  page: number,
): ActionRowBuilder<ButtonBuilder>[] => {
  const totalPages = getNumberPageCount(dieSides);
  const currentPage = clampPage(page, totalPages);
  const startValue = currentPage * numbersPerPage + 1;
  const endValue = Math.min(dieSides, startValue + numbersPerPage - 1);
  const buttons = Array.from({ length: endValue - startValue + 1 }, (_, index) => {
    const value = startValue + index;
    const isBanned = bannedValues.has(value);
    const noSlotsLeft = usedCount >= unlockedSlots;
    const dieAtLimit = bannedValues.size >= getMaxBansPerDie(dieSides);
    const shouldDisable = !isBanned && (noSlotsLeft || dieAtLimit);
    return new ButtonBuilder()
      .setCustomId(buildBanButtonId(userId, dieIndex, value, currentPage))
      .setLabel(`${value}`)
      .setStyle(isBanned ? ButtonStyle.Danger : ButtonStyle.Primary)
      .setDisabled(shouldDisable);
  });

  const rows = chunkButtons(buttons);
  const navButtons: ButtonBuilder[] = [];
  if (totalPages > 1) {
    navButtons.push(
      new ButtonBuilder()
        .setCustomId(buildPageButtonId(userId, dieIndex, currentPage - 1))
        .setLabel("Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 0),
      new ButtonBuilder()
        .setCustomId(buildPageButtonId(userId, dieIndex, currentPage + 1))
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1),
    );
  }
  navButtons.push(
    new ButtonBuilder()
      .setCustomId(buildBackButtonId(userId))
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildCloseButtonId(userId))
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary),
  );

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...navButtons));
  return rows;
};

const chunkButtons = (buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] => {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += numbersPerRow) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(i, i + numbersPerRow)),
    );
  }
  return rows;
};

const buildDieButtonId = (userId: string, dieIndex: number): string => {
  return `${diceBansButtonPrefix}die:${userId}:${dieIndex}`;
};

const buildBanButtonId = (
  userId: string,
  dieIndex: number,
  value: number,
  page: number,
): string => {
  return `${diceBansButtonPrefix}ban:${userId}:${dieIndex}:${value}:${page}`;
};

const buildPageButtonId = (userId: string, dieIndex: number, page: number): string => {
  return `${diceBansButtonPrefix}page:${userId}:${dieIndex}:${page}`;
};

const buildBackButtonId = (userId: string): string => {
  return `${diceBansButtonPrefix}back:${userId}`;
};

const buildCloseButtonId = (userId: string): string => {
  return `${diceBansButtonPrefix}close:${userId}`;
};

const buildClearBansButtonId = (userId: string): string => {
  return `${diceBansButtonPrefix}clear-bans:${userId}`;
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
