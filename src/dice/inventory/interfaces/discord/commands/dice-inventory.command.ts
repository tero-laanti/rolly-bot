import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import {
  buildAutoRollSessionStartingContent,
  cancelActiveAutoRollSession,
  releaseAutoRollSessionReservation,
  reserveAutoRollSession,
  startReservedAutoRollSession,
} from "../../../infrastructure/auto-roller-runtime";
import { getDatabase } from "../../../../../shared/db";
import {
  createSqliteDiceInventoryCommandServices,
  createSqliteDiceInventoryUseCase,
} from "../../../infrastructure/sqlite/services";
import { diceInventoryButtonPrefix, parseDiceInventoryAction } from "../buttons/inventory-buttons";
import { renderDiceInventoryResult } from "../presenters/inventory.presenter";

const handleDiceInventoryButton = async (interaction: ButtonInteraction): Promise<void> => {
  const db = getDatabase();
  const {
    finalizeAutoRollItemUse,
    inventoryUseCase,
    refundInventoryItem,
    triggerRandomGroupEvent,
  } = createSqliteDiceInventoryCommandServices(db);
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

  const outcome = await inventoryUseCase.handleDiceInventoryAction(interaction.user.id, action, {
    reserveAutoRollSession,
    triggerRandomGroupEvent,
  });

  if (!outcome.autoRollStart) {
    await applyButtonResult(interaction, renderDiceInventoryResult(outcome.result));
    return;
  }

  const started = await startReservedAutoRollSession(outcome.autoRollStart.reservation, {
    db,
    message: interaction.message,
    userMention: interaction.user.toString(),
  });
  if (!started) {
    releaseAutoRollSessionReservation(outcome.autoRollStart.reservation);
    refundInventoryItem({
      userId: interaction.user.id,
      itemId: outcome.autoRollStart.itemId,
      quantity: 1,
    });
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Clockwork Croupier failed to start. The item was refunded.",
        ephemeral: true,
      },
    });
    return;
  }

  let achievementText: string | undefined;
  try {
    achievementText = finalizeAutoRollItemUse({
      userId: interaction.user.id,
      itemId: outcome.autoRollStart.itemId,
    }).achievementText;
  } catch (error) {
    cancelActiveAutoRollSession(interaction.user.id);
    refundInventoryItem({
      userId: interaction.user.id,
      itemId: outcome.autoRollStart.itemId,
      quantity: 1,
    });
    console.error("Failed to finalize auto-roll session startup:", error);
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Clockwork Croupier failed to start. The item was refunded.",
        ephemeral: true,
      },
    });
    return;
  }

  const content = achievementText
    ? `${buildAutoRollSessionStartingContent(outcome.autoRollStart.reservation)}\n${achievementText}`
    : buildAutoRollSessionStartingContent(outcome.autoRollStart.reservation);
  await applyButtonResult(interaction, {
    kind: "update",
    payload: {
      content,
      components: [],
    },
  });
};

export const data = new SlashCommandBuilder()
  .setName("dice-inventory")
  .setDescription("View and use your inventory items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const inventoryUseCase = createSqliteDiceInventoryUseCase(getDatabase());
  await applyChatInputResult(
    interaction,
    renderDiceInventoryResult(inventoryUseCase.createDiceInventoryReply(interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: diceInventoryButtonPrefix,
    handle: handleDiceInventoryButton,
  },
];
