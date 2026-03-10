import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import {
  createDiceBansReply,
  diceBansButtonPrefix,
  handleDiceBansAction,
} from "../../../application/manage-bans/use-case";

const handleDiceBansButton = async (interaction: ButtonInteraction): Promise<void> => {
  await applyButtonResult(
    interaction,
    handleDiceBansAction(getDatabase(), interaction.user.id, interaction.customId),
  );
};

export const data = new SlashCommandBuilder()
  .setName("dice-bans")
  .setDescription("Configure your dice bans.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(interaction, createDiceBansReply(getDatabase(), interaction.user.id));
};

export const buttonHandlers = [
  {
    prefix: diceBansButtonPrefix,
    handle: handleDiceBansButton,
  },
];
