import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import {
  createDicePrestigeReply,
  dicePrestigeButtonPrefix,
  handleDicePrestigeAction,
} from "../../../application/manage-prestige/use-case";

const handleDicePrestigeButton = async (interaction: ButtonInteraction): Promise<void> => {
  await applyButtonResult(
    interaction,
    handleDicePrestigeAction(getDatabase(), interaction.user.id, interaction.customId),
  );
};

export const data = new SlashCommandBuilder()
  .setName("dice-prestige")
  .setDescription("Manage your prestige progression and active prestige level.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    createDicePrestigeReply(getDatabase(), interaction.user.id),
  );
};

export const buttonHandlers = [
  {
    prefix: dicePrestigeButtonPrefix,
    handle: handleDicePrestigeButton,
  },
];
