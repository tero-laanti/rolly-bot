import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { getDiceCasinoMaxBet, getDiceCasinoMinBet } from "../../../domain/game-rules";
import { createSqliteDiceCasinoUseCase } from "../../../infrastructure/sqlite/services";
import { diceCasinoButtonPrefix, parseDiceCasinoAction } from "../buttons/casino-buttons";
import { renderDiceCasinoResult } from "../presenters/casino.presenter";

const handleDiceCasinoButton = async (interaction: ButtonInteraction): Promise<void> => {
  const action = parseDiceCasinoAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown casino action.",
        ephemeral: true,
      },
    });
    return;
  }

  const casinoUseCase = createSqliteDiceCasinoUseCase(getDatabase());
  await applyButtonResult(
    interaction,
    renderDiceCasinoResult(casinoUseCase.handleDiceCasinoAction(interaction.user.id, action)),
  );
};

export const data = new SlashCommandBuilder()
  .setName("dice-casino")
  .setDescription("Play dice-based casino games with your pips.")
  .addIntegerOption((option) =>
    option
      .setName("bet")
      .setDescription("Optional opening bet.")
      .setMinValue(getDiceCasinoMinBet())
      .setMaxValue(getDiceCasinoMaxBet())
      .setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const casinoUseCase = createSqliteDiceCasinoUseCase(getDatabase());
  const requestedBet = interaction.options.getInteger("bet");
  const replyPlan = casinoUseCase.createDiceCasinoReply(interaction.user.id, requestedBet);

  await applyChatInputResult(interaction, renderDiceCasinoResult(replyPlan.result));

  if (!replyPlan.finalizeSessionToken) {
    return;
  }

  let finalizedReply: ReturnType<typeof renderDiceCasinoResult>;
  try {
    finalizedReply = renderDiceCasinoResult(
      casinoUseCase.finalizeDiceCasinoReply(
        interaction.user.id,
        requestedBet,
        replyPlan.finalizeSessionToken,
      ),
    );
  } catch (error) {
    try {
      await interaction.editReply({
        content: "Failed to refresh the casino panel. Your previous panel is still active.",
        components: [],
      });
    } catch {
      // Ignore best-effort recovery failures and surface the original error.
    }

    throw error;
  }

  if (finalizedReply.kind !== "edit") {
    throw new Error(
      `Casino reply finalization must edit the initial reply, got ${finalizedReply.kind}.`,
    );
  }

  await interaction.editReply(finalizedReply.payload);
};

export const buttonHandlers = [
  {
    prefix: diceCasinoButtonPrefix,
    handle: handleDiceCasinoButton,
  },
];
