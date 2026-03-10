import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import {
  createDicePrestigeReply,
  handleDicePrestigeAction,
} from "../../../application/manage-prestige/use-case";
import { dicePrestigeButtonPrefix, parseDicePrestigeAction } from "../buttons/prestige-buttons";
import { renderDicePrestigeResult } from "../presenters/prestige.presenter";

const handleDicePrestigeButton = async (interaction: ButtonInteraction): Promise<void> => {
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
    renderDicePrestigeResult(handleDicePrestigeAction(getDatabase(), interaction.user.id, action)),
  );
};

export const data = new SlashCommandBuilder()
  .setName("dice-prestige")
  .setDescription("Manage your prestige progression and active prestige level.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    renderDicePrestigeResult(createDicePrestigeReply(getDatabase(), interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: dicePrestigeButtonPrefix,
    handle: handleDicePrestigeButton,
  },
];
