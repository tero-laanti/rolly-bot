import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import {
  createDiceBansReply,
  handleDiceBansAction,
} from "../../../application/manage-bans/use-case";
import { diceBansButtonPrefix, parseDiceBansAction } from "../buttons/bans-buttons";
import { renderDiceBansResult } from "../presenters/bans.presenter";

const handleDiceBansButton = async (interaction: ButtonInteraction): Promise<void> => {
  const action = parseDiceBansAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown ban action.",
        ephemeral: true,
      },
    });
    return;
  }

  await applyButtonResult(
    interaction,
    renderDiceBansResult(handleDiceBansAction(getDatabase(), interaction.user.id, action)),
  );
};

export const data = new SlashCommandBuilder()
  .setName("dice-bans")
  .setDescription("Configure your dice bans.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    renderDiceBansResult(createDiceBansReply(getDatabase(), interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: diceBansButtonPrefix,
    handle: handleDiceBansButton,
  },
];
