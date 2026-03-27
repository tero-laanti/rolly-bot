import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteQueryDiceStatsUseCase } from "../../../infrastructure/sqlite/services";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("Show your current dice stats.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const queryDiceStats = createSqliteQueryDiceStatsUseCase(getDatabase());
  const result = queryDiceStats({
    userId: interaction.user.id,
    userMention: interaction.user.toString(),
    nowMs: Date.now(),
  });

  await interaction.reply({
    ...result,
    allowedMentions: {
      users: [],
    },
  });
};
