import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteQueryDiceAchievementsUseCase } from "../../../infrastructure/sqlite/services";
import {
  diceAchievementsButtonPrefix,
  parseDiceAchievementsAction,
} from "../buttons/achievements-buttons";
import { renderDiceAchievementsResult } from "../presenters/achievements.presenter";

const handleDiceAchievementsButton = async (interaction: ButtonInteraction): Promise<void> => {
  const achievementsUseCase = createSqliteQueryDiceAchievementsUseCase(getDatabase());
  const action = parseDiceAchievementsAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown achievements action.",
        ephemeral: true,
      },
    });
    return;
  }

  await applyButtonResult(
    interaction,
    renderDiceAchievementsResult(
      achievementsUseCase.handleDiceAchievementsAction(interaction.user.id, action),
    ),
  );
};

export const data = new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("Browse your dice achievements.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const achievementsUseCase = createSqliteQueryDiceAchievementsUseCase(getDatabase());
  await applyChatInputResult(
    interaction,
    renderDiceAchievementsResult(
      achievementsUseCase.createDiceAchievementsReply(interaction.user.id),
    ),
  );
};

export const buttonHandlers = [
  {
    prefix: diceAchievementsButtonPrefix,
    handle: handleDiceAchievementsButton,
  },
];
