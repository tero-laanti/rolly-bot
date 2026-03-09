import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../lib/db";
import { getDiceAchievement, getPrestigeAchievementId } from "../../lib/minigames/achievements";
import {
  awardAchievements,
  getActiveDicePrestige,
  getDiceLevel,
  getDicePrestigeBaseLevel,
  getDicePrestige,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
  resetDiceLevelAnalyticsProgress,
  resetDicePrestigeAnalyticsProgress,
  setActiveDicePrestige,
  setDiceLevelForPrestige,
  setDicePrestige,
} from "../../lib/minigames/dice-game";

const prestigeButtonsPerRow = 5;
export const dicePrestigeButtonPrefix = "dice-prestige:";

export const data = new SlashCommandBuilder()
  .setName("dice-prestige")
  .setDescription("Manage your prestige progression and active prestige level.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const state = getPrestigeState(interaction.user.id);
  await interaction.reply({
    content: buildMainContent(interaction.user.id, state),
    components: buildMainComponents(interaction.user.id, state),
    ephemeral: false,
  });
};

export const handleDicePrestigeButton = async (interaction: ButtonInteraction): Promise<void> => {
  const [prefix, action, ownerId, valueRaw] = interaction.customId.split(":");
  if (prefix !== dicePrestigeButtonPrefix.slice(0, -1)) {
    return;
  }

  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "This prestige menu is not assigned to you.",
      ephemeral: true,
    });
    return;
  }

  if (action === "choose") {
    const state = getPrestigeState(ownerId);
    await interaction.update({
      content: buildSelectContent(ownerId, state),
      components: buildSelectComponents(ownerId, state),
    });
    return;
  }

  if (action === "back") {
    const state = getPrestigeState(ownerId);
    await interaction.update({
      content: buildMainContent(ownerId, state),
      components: buildMainComponents(ownerId, state),
    });
    return;
  }

  if (action === "set") {
    const nextActivePrestige = Number.parseInt(valueRaw ?? "", 10);
    if (!Number.isInteger(nextActivePrestige) || nextActivePrestige < 0) {
      await interaction.reply({
        content: "Invalid prestige selection.",
        ephemeral: true,
      });
      return;
    }

    const db = getDatabase();
    const highestPrestige = getDicePrestige(db, ownerId);
    if (nextActivePrestige > highestPrestige) {
      await interaction.reply({
        content: "You have not unlocked that prestige level.",
        ephemeral: true,
      });
      return;
    }

    setActiveDicePrestige(db, {
      userId: ownerId,
      prestige: nextActivePrestige,
    });
    resetDiceLevelAnalyticsProgress(db, ownerId);

    const state = getPrestigeState(ownerId);
    await interaction.update({
      content: buildMainContent(ownerId, state),
      components: buildMainComponents(ownerId, state),
    });
    return;
  }

  if (action === "up") {
    const state = getPrestigeState(ownerId);
    if (!state.canPrestigeUp) {
      await interaction.update({
        content: buildMainContent(ownerId, state),
        components: buildMainComponents(ownerId, state),
      });
      return;
    }

    const db = getDatabase();
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

    const refreshed = getPrestigeState(ownerId);
    const achievementText =
      newlyEarned.length > 0
        ? `\nAchievement unlocked: ${newlyEarned.map((id) => getDiceAchievement(id)?.name ?? id).join(", ")}.`
        : "";
    await interaction.update({
      content: `Prestige complete. Your active die is now d${getDiceSidesForPrestige(nextPrestige)} and prestige ${nextPrestige} starts at level 1.${achievementText}\n\n${buildMainContent(ownerId, refreshed)}`,
      components: buildMainComponents(ownerId, refreshed),
    });
    return;
  }

  await interaction.reply({
    content: "Unknown prestige action.",
    ephemeral: true,
  });
};

type PrestigeState = {
  activePrestige: number;
  highestPrestige: number;
  activeLevel: number;
  canPrestigeUp: boolean;
};

const getPrestigeState = (userId: string): PrestigeState => {
  const db = getDatabase();
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
