import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../shared/db";
import { applyButtonResult, applyChatInputResult } from "../../bot/interaction-response";
import {
  createDicePrestigeReply,
  dicePrestigeButtonPrefix,
  handleDicePrestigeAction,
} from "../../dice/application/manage-dice-prestige";

export { dicePrestigeButtonPrefix };

export const data = new SlashCommandBuilder()
  .setName("dice-prestige")
  .setDescription("Manage your prestige progression and active prestige level.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    createDicePrestigeReply(getDatabase(), interaction.user.id),
  );
};

export const handleDicePrestigeButton = async (interaction: ButtonInteraction): Promise<void> => {
  await applyButtonResult(
    interaction,
    handleDicePrestigeAction(getDatabase(), interaction.user.id, interaction.customId),
  );
};
