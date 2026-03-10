import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../../../../app/discord/interaction-response";
import {
  buildAutoRollSessionStartingContent,
  releaseAutoRollSessionReservation,
  reserveAutoRollSession,
  startReservedAutoRollSession,
} from "../../../infrastructure/auto-roller-runtime";
import { triggerRandomGroupEventNow } from "../../../../random-events/infrastructure/admin-controller";
import { grantInventoryItem } from "../../../../inventory/domain/shop";
import {
  createDiceInventoryReply,
  handleDiceInventoryAction,
} from "../../../application/manage-inventory/use-case";
import { getDatabase } from "../../../../../shared/db";
import {
  diceInventoryButtonPrefix,
  parseDiceInventoryAction,
} from "../buttons/inventory-buttons";
import { renderDiceInventoryResult } from "../presenters/inventory.presenter";

const handleDiceInventoryButton = async (interaction: ButtonInteraction): Promise<void> => {
  const db = getDatabase();
  const action = parseDiceInventoryAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown inventory action.",
        ephemeral: true,
      },
    });
    return;
  }

  const outcome = await handleDiceInventoryAction(db, interaction.user.id, action, {
    reserveAutoRollSession,
    triggerRandomGroupEvent: triggerRandomGroupEventNow,
  });

  if (outcome.autoRollStart) {
    await applyButtonResult(interaction, {
      kind: "update",
      payload: {
        content: buildAutoRollSessionStartingContent(outcome.autoRollStart.reservation),
        components: [],
      },
    });
  } else {
    await applyButtonResult(interaction, renderDiceInventoryResult(outcome.result));
  }

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

export const data = new SlashCommandBuilder()
  .setName("dice-inventory")
  .setDescription("View and use your inventory items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    renderDiceInventoryResult(createDiceInventoryReply(getDatabase(), interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: diceInventoryButtonPrefix,
    handle: handleDiceInventoryButton,
  },
];
