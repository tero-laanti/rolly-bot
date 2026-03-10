import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../../../../shared/db";
import { queryDiceAnalytics } from "../../../application/query-dashboard/use-case";

export const data = new SlashCommandBuilder()
  .setName("dice-analytics")
  .setDescription("Show your dice progression analytics.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await interaction.reply(
    queryDiceAnalytics(
      getDatabase(),
      interaction.user.id,
      interaction.user.toString(),
      Date.now(),
    ),
  );
};
