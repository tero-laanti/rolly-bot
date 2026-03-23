import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteDicePrestigeUseCase } from "../../../infrastructure/sqlite/services";
import { dicePrestigeButtonPrefix, parseDicePrestigeAction } from "../buttons/prestige-buttons";
import { renderDicePrestigeResult } from "../presenters/prestige.presenter";

const handleDicePrestigeButton = async (interaction: ButtonInteraction): Promise<void> => {
  const prestigeUseCase = createSqliteDicePrestigeUseCase(getDatabase());
  const action = parseDicePrestigeAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown prestige action.",
        ephemeral: true,
      },
    });
    return;
  }

  await applyButtonResult(
    interaction,
    renderDicePrestigeResult(prestigeUseCase.handleDicePrestigeAction(interaction.user.id, action)),
  );
};

export const data = new SlashCommandBuilder()
  .setName("prestige")
  .setDescription("Manage your prestige progression and active prestige level.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const prestigeUseCase = createSqliteDicePrestigeUseCase(getDatabase());
  await applyChatInputResult(
    interaction,
    renderDicePrestigeResult(prestigeUseCase.createDicePrestigeReply(interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: dicePrestigeButtonPrefix,
    handle: handleDicePrestigeButton,
  },
];
