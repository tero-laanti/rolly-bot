import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteDiceBansUseCase } from "../../../infrastructure/sqlite/services";
import { diceBansButtonPrefix, parseDiceBansAction } from "../buttons/bans-buttons";
import { renderDiceBansResult } from "../presenters/bans.presenter";

const handleDiceBansButton = async (interaction: ButtonInteraction): Promise<void> => {
  const bansUseCase = createSqliteDiceBansUseCase(getDatabase());
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
    renderDiceBansResult(bansUseCase.handleDiceBansAction(interaction.user.id, action)),
  );
};

export const data = new SlashCommandBuilder()
  .setName("bans")
  .setDescription("Configure your dice bans.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const bansUseCase = createSqliteDiceBansUseCase(getDatabase());
  await applyChatInputResult(
    interaction,
    renderDiceBansResult(bansUseCase.createDiceBansReply(interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: diceBansButtonPrefix,
    handle: handleDiceBansButton,
  },
];
