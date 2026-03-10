import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../../../../shared/db";
import { queryDiceAchievements } from "../../../application/query-achievements/use-case";

export const data = new SlashCommandBuilder()
  .setName("dice-achievements")
  .setDescription("Show your unlocked dice achievements.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await interaction.reply(queryDiceAchievements(getDatabase(), interaction.user.id));
};
