import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { SqliteDatabase } from "../../../shared/db";
import type { InteractionResult } from "../../../bot/interaction-response";
import { getDiceAchievement, getPrestigeAchievementId } from "../domain/achievements";
import { awardAchievements } from "../domain/achievements-store";
import {
  getDicePrestigeBaseLevel,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "../domain/game-rules";
import {
  resetDiceLevelAnalyticsProgress,
  resetDicePrestigeAnalyticsProgress,
} from "../domain/analytics";
import {
  getActiveDicePrestige,
  getDiceLevel,
  getDicePrestige,
  setActiveDicePrestige,
  setDiceLevelForPrestige,
  setDicePrestige,
} from "../domain/prestige";

const prestigeButtonsPerRow = 5;
export const dicePrestigeButtonPrefix = "dice-prestige:";

type PrestigeState = {
  activePrestige: number;
  highestPrestige: number;
  activeLevel: number;
  canPrestigeUp: boolean;
};

export const createDicePrestigeReply = (
  db: SqliteDatabase,
  userId: string,
): InteractionResult => {
  const state = getPrestigeState(db, userId);
  return {
    kind: "reply",
    payload: {
      content: buildMainContent(userId, state),
      components: buildMainComponents(userId, state),
      ephemeral: false,
    },
  };
};

export const handleDicePrestigeAction = (
  db: SqliteDatabase,
  actorId: string,
  customId: string,
): InteractionResult => {
  const [prefix, action, ownerId, valueRaw] = customId.split(":");
  if (prefix !== dicePrestigeButtonPrefix.slice(0, -1)) {
    return {
      kind: "reply",
      payload: {
        content: "Unknown prestige action.",
        ephemeral: true,
      },
    };
  }

  if (!ownerId || actorId !== ownerId) {
    return {
      kind: "reply",
      payload: {
        content: "This prestige menu is not assigned to you.",
        ephemeral: true,
      },
    };
  }

  if (action === "choose") {
    const state = getPrestigeState(db, ownerId);
    return {
      kind: "update",
      payload: {
        content: buildSelectContent(ownerId, state),
        components: buildSelectComponents(ownerId, state),
      },
    };
  }

  if (action === "back") {
    const state = getPrestigeState(db, ownerId);
    return {
      kind: "update",
      payload: {
        content: buildMainContent(ownerId, state),
        components: buildMainComponents(ownerId, state),
      },
    };
  }

  if (action === "set") {
    const nextActivePrestige = Number.parseInt(valueRaw ?? "", 10);
    if (!Number.isInteger(nextActivePrestige) || nextActivePrestige < 0) {
      return {
        kind: "reply",
        payload: {
          content: "Invalid prestige selection.",
          ephemeral: true,
        },
      };
    }

    const highestPrestige = getDicePrestige(db, ownerId);
    if (nextActivePrestige > highestPrestige) {
      return {
        kind: "reply",
        payload: {
          content: "You have not unlocked that prestige level.",
          ephemeral: true,
        },
      };
    }

    setActiveDicePrestige(db, {
      userId: ownerId,
      prestige: nextActivePrestige,
    });
    resetDiceLevelAnalyticsProgress(db, ownerId);

    const state = getPrestigeState(db, ownerId);
    return {
      kind: "update",
      payload: {
        content: buildMainContent(ownerId, state),
        components: buildMainComponents(ownerId, state),
      },
    };
  }

  if (action === "up") {
    const state = getPrestigeState(db, ownerId);
    if (!state.canPrestigeUp) {
      return {
        kind: "update",
        payload: {
          content: buildMainContent(ownerId, state),
          components: buildMainComponents(ownerId, state),
        },
      };
    }

    const nextPrestige = state.highestPrestige + 1;
    const newlyEarned = db.transaction(() => {
      setDicePrestige(db, { userId: ownerId, prestige: nextPrestige });
      setActiveDicePrestige(db, { userId: ownerId, prestige: nextPrestige });
      setDiceLevelForPrestige(db, { userId: ownerId, prestige: nextPrestige, level: 1 });
      resetDicePrestigeAnalyticsProgress(db, ownerId);

      const achievementId = getPrestigeAchievementId(nextPrestige);
      if (!achievementId) {
        return [];
      }

      return awardAchievements(db, ownerId, [achievementId]);
    })();

    const refreshed = getPrestigeState(db, ownerId);
    const achievementText =
      newlyEarned.length > 0
        ? `\nAchievement unlocked: ${newlyEarned.map((id) => getDiceAchievement(id)?.name ?? id).join(", ")}.`
        : "";

    return {
      kind: "update",
      payload: {
        content: `Prestige complete. Your active die is now d${getDiceSidesForPrestige(nextPrestige)} and prestige ${nextPrestige} starts at level 1.${achievementText}\n\n${buildMainContent(ownerId, refreshed)}`,
        components: buildMainComponents(ownerId, refreshed),
      },
    };
  }

  return {
    kind: "reply",
    payload: {
      content: "Unknown prestige action.",
      ephemeral: true,
    },
  };
};

const getPrestigeState = (db: SqliteDatabase, userId: string): PrestigeState => {
  const highestPrestige = getDicePrestige(db, userId);
  const activePrestige = getActiveDicePrestige(db, userId);
  const activeLevel = getDiceLevel(db, userId);
  const maxDicePrestige = getMaxDicePrestige();
  const canPrestigeUp =
    activePrestige === highestPrestige &&
    highestPrestige < maxDicePrestige &&
    activeLevel >= getDicePrestigeBaseLevel();

  return {
    activePrestige,
    highestPrestige,
    activeLevel,
    canPrestigeUp,
  };
};

const buildMainContent = (userId: string, state: PrestigeState): string => {
  const nextPrestige = state.highestPrestige + 1;
  const maxDicePrestige = getMaxDicePrestige();
  const requirementLine =
    state.highestPrestige >= maxDicePrestige
      ? "Maximum prestige reached."
      : state.activePrestige !== state.highestPrestige
        ? `Prestige up unavailable. Select prestige ${state.highestPrestige} to continue progression.`
        : state.activeLevel >= getDicePrestigeBaseLevel()
          ? `Prestige up available: ${state.highestPrestige} -> ${nextPrestige} (d${getDiceSidesForPrestige(nextPrestige)}).`
          : `Prestige up requires level ${getDicePrestigeBaseLevel()} on prestige ${state.highestPrestige}.`;

  return [
    `Dice prestige for <@${userId}>:`,
    `Active prestige: ${state.activePrestige} (d${getDiceSidesForPrestige(state.activePrestige)}), level ${state.activeLevel}.`,
    `Highest unlocked prestige: ${state.highestPrestige} (d${getDiceSidesForPrestige(state.highestPrestige)}).`,
    requirementLine,
  ].join("\n");
};

const buildMainComponents = (
  userId: string,
  state: PrestigeState,
): ActionRowBuilder<ButtonBuilder>[] => {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildPrestigeUpButtonId(userId))
        .setLabel("Prestige up")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!state.canPrestigeUp),
      new ButtonBuilder()
        .setCustomId(buildChoosePrestigeButtonId(userId))
        .setLabel("Choose prestige")
        .setStyle(ButtonStyle.Primary),
    ),
  ];
};

const buildSelectContent = (userId: string, state: PrestigeState): string => {
  return [
    `Choose active prestige for <@${userId}>.`,
    `Current: ${state.activePrestige} (d${getDiceSidesForPrestige(state.activePrestige)}), level ${state.activeLevel}.`,
    `Unlocked range: 0-${state.highestPrestige}.`,
  ].join("\n");
};

const buildSelectComponents = (
  userId: string,
  state: PrestigeState,
): ActionRowBuilder<ButtonBuilder>[] => {
  const levelButtons = Array.from({ length: state.highestPrestige + 1 }, (_, index) => {
    const prestige = index;
    const isSelected = prestige === state.activePrestige;
    return new ButtonBuilder()
      .setCustomId(buildSetPrestigeButtonId(userId, prestige))
      .setLabel(isSelected ? `P${prestige} (Active)` : `P${prestige}`)
      .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(isSelected);
  });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let index = 0; index < levelButtons.length; index += prestigeButtonsPerRow) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...levelButtons.slice(index, index + prestigeButtonsPerRow),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildBackButtonId(userId))
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
};

const buildPrestigeUpButtonId = (userId: string): string => {
  return `${dicePrestigeButtonPrefix}up:${userId}`;
};

const buildChoosePrestigeButtonId = (userId: string): string => {
  return `${dicePrestigeButtonPrefix}choose:${userId}`;
};

const buildSetPrestigeButtonId = (userId: string, prestige: number): string => {
  return `${dicePrestigeButtonPrefix}set:${userId}:${prestige}`;
};

const buildBackButtonId = (userId: string): string => {
  return `${dicePrestigeButtonPrefix}back:${userId}`;
};
