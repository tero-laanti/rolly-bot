import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { applyRenderedChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteRollDiceUseCase } from "../../../infrastructure/sqlite/services";
import { renderDiceRollResult } from "../presenters/roll.presenter";

export const data = new SlashCommandBuilder().setName("roll").setDescription("Roll your dice.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const runRollDiceUseCase = createSqliteRollDiceUseCase(getDatabase());
  await applyRenderedChatInputResult(
    interaction,
    renderDiceRollResult(
      runRollDiceUseCase({
        userId: interaction.user.id,
        userMention: interaction.user.toString(),
        raidThreadId: interaction.channelId,
      }),
    ),
  );
};
