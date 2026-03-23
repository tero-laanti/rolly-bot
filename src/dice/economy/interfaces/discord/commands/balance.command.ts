import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteQueryDiceBalanceUseCase } from "../../../infrastructure/sqlite/services";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Show your Fame and Pips.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const queryDiceBalance = createSqliteQueryDiceBalanceUseCase(getDatabase());
  await interaction.reply(queryDiceBalance.createDiceBalanceReply(interaction.user.id));
};
