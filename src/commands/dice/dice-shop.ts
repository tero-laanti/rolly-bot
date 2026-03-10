import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../bot/interaction-response";
import {
  createDiceShopReply,
  diceShopButtonPrefix,
  handleDiceShopAction,
} from "../../dice/core/application/manage-dice-shop";
import { getDatabase } from "../../shared/db";

export { diceShopButtonPrefix };

export const data = new SlashCommandBuilder()
  .setName("dice-shop")
  .setDescription("Spend your pips on shop items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(interaction, createDiceShopReply(getDatabase(), interaction.user.id));
};

export const handleDiceShopButton = async (interaction: ButtonInteraction): Promise<void> => {
  await applyButtonResult(
    interaction,
    handleDiceShopAction(getDatabase(), interaction.user.id, interaction.customId),
  );
};
