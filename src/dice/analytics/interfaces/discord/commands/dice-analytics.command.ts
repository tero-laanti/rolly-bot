import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteQueryDiceAnalyticsUseCase } from "../../../infrastructure/sqlite/services";

export const data = new SlashCommandBuilder()
  .setName("dice-analytics")
  .setDescription("Show your dice progression analytics.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const queryDiceAnalytics = createSqliteQueryDiceAnalyticsUseCase(getDatabase());
  await interaction.reply(
    queryDiceAnalytics({
      userId: interaction.user.id,
      userMention: interaction.user.toString(),
      nowMs: Date.now(),
    }),
  );
};
