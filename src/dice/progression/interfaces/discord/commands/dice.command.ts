import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { runRollDiceUseCase } from "../../../application/roll-dice/use-case";
import { renderDiceRollResult } from "../presenters/dice.presenter";

export const data = new SlashCommandBuilder().setName("dice").setDescription("Roll your dice.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    renderDiceRollResult(
      runRollDiceUseCase({
        db: getDatabase(),
        userId: interaction.user.id,
        userMention: interaction.user.toString(),
      }),
    ),
  );
};
