import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteQueryContractsUseCase } from "../../../infrastructure/sqlite/services";

export const data = new SlashCommandBuilder()
  .setName("contracts")
  .setDescription("Show your active daily and weekly contracts.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const queryContracts = createSqliteQueryContractsUseCase(getDatabase());
  await interaction.reply(
    queryContracts.createContractsReply({
      userId: interaction.user.id,
      userMention: interaction.user.toString(),
      now: new Date(),
    }),
  );
};
