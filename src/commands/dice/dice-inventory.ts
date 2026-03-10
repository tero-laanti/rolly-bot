import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../bot/interaction-response";
import {
  createDiceInventoryReply,
  diceInventoryButtonPrefix,
  handleDiceInventoryAction,
} from "../../dice/core/application/manage-dice-inventory";
import { getDatabase } from "../../shared/db";

export { diceInventoryButtonPrefix };

export const data = new SlashCommandBuilder()
  .setName("dice-inventory")
  .setDescription("View and use your inventory items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    createDiceInventoryReply(getDatabase(), interaction.user.id),
  );
};

export const handleDiceInventoryButton = async (interaction: ButtonInteraction): Promise<void> => {
  await applyButtonResult(
    interaction,
    handleDiceInventoryAction(getDatabase(), interaction.user.id, interaction.customId),
  );
};
