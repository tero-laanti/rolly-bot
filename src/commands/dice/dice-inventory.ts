import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../bot/interaction-response";
import {
  createDiceInventoryReply,
  diceInventoryButtonPrefix,
  handleDiceInventoryAction,
} from "../../dice/core/application/manage-dice-inventory";
import {
  releaseAutoRollSessionReservation,
  reserveAutoRollSession,
  startReservedAutoRollSession,
} from "../../dice/features/auto-roller/runtime";
import { getDatabase } from "../../shared/db";
import { grantInventoryItem } from "../../dice/core/domain/shop";

export { diceInventoryButtonPrefix };

export const data = new SlashCommandBuilder()
  .setName("dice-inventory")
  .setDescription("View and use your inventory items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    createDiceInventoryReply(getDatabase(), interaction.user.id),
  );
};

export const handleDiceInventoryButton = async (interaction: ButtonInteraction): Promise<void> => {
  const db = getDatabase();
  const outcome = await handleDiceInventoryAction(db, interaction.user.id, interaction.customId, {
    reserveAutoRollSession,
  });

  await applyButtonResult(interaction, outcome.interactionResult);

  if (!outcome.autoRollStart) {
    return;
  }

  const started = await startReservedAutoRollSession(outcome.autoRollStart.reservation, {
    db,
    message: interaction.message,
    userMention: interaction.user.toString(),
  });
  if (started) {
    return;
  }

  releaseAutoRollSessionReservation(outcome.autoRollStart.reservation);
  grantInventoryItem(db, {
    userId: interaction.user.id,
    itemId: outcome.autoRollStart.itemId,
    quantity: 1,
  });
  await interaction.followUp({
    content: "Clockwork Croupier failed to start. The item was refunded.",
    ephemeral: true,
  });
};
