import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../../../../shared/db";
import { runRollDiceUseCase } from "../../../application/roll-dice/use-case";

export const data = new SlashCommandBuilder().setName("dice").setDescription("Roll your dice.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const response = runRollDiceUseCase({
    db: getDatabase(),
    userId: interaction.user.id,
    userMention: interaction.user.toString(),
  });

  await interaction.reply(response);
};
