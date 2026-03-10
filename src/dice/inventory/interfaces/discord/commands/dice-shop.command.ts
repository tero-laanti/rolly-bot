import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import {
  createDiceShopReply,
  diceShopButtonPrefix,
  handleDiceShopAction,
} from "../../../application/manage-shop/use-case";

const handleDiceShopButton = async (interaction: ButtonInteraction): Promise<void> => {
  await applyButtonResult(
    interaction,
    handleDiceShopAction(getDatabase(), interaction.user.id, interaction.customId),
  );
};

export const data = new SlashCommandBuilder()
  .setName("dice-shop")
  .setDescription("Spend your pips on shop items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(interaction, createDiceShopReply(getDatabase(), interaction.user.id));
};

export const buttonHandlers = [
  {
    prefix: diceShopButtonPrefix,
    handle: handleDiceShopButton,
  },
];
