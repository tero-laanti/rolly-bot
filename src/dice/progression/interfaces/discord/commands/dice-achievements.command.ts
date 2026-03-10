import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteQueryDiceAchievementsUseCase } from "../../../infrastructure/sqlite/services";

export const data = new SlashCommandBuilder()
  .setName("dice-achievements")
  .setDescription("Show your unlocked dice achievements.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const queryDiceAchievements = createSqliteQueryDiceAchievementsUseCase(getDatabase());
  await interaction.reply(queryDiceAchievements(interaction.user.id));
};
