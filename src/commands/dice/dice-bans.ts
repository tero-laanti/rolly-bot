import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../shared/db";
import {
  createDiceBansReply,
  diceBansButtonPrefix,
  handleDiceBansAction,
} from "../../dice/core/application/manage-dice-bans";
import { applyButtonResult, applyChatInputResult } from "../../bot/interaction-response";

export { diceBansButtonPrefix };

export const data = new SlashCommandBuilder()
  .setName("dice-bans")
  .setDescription("Configure your dice bans.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(interaction, createDiceBansReply(getDatabase(), interaction.user.id));
};

export const handleDiceBansButton = async (interaction: ButtonInteraction): Promise<void> => {
  await applyButtonResult(
    interaction,
    handleDiceBansAction(getDatabase(), interaction.user.id, interaction.customId),
  );
};
