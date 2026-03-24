import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyRenderedChatInputResult,
  createRenderedInteractionResult,
} from "../../../../../app/discord/interaction-response";
import { publishAchievementAnnouncements } from "../../../../../app/discord/achievement-announcements";
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
    const rendered = renderDiceInventoryResult(outcome.result);
    await applyButtonResult(interaction, rendered.interactionResult);
    await publishAchievementAnnouncements({
      client: interaction.client,
      announcements: outcome.achievementAnnouncements ?? rendered.achievementAnnouncements ?? [],
    });
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

  let achievementAnnouncements = outcome.achievementAnnouncements ?? [];
  try {
    achievementAnnouncements = [
      ...achievementAnnouncements,
      ...(finalizeAutoRollItemUse({
        userId: interaction.user.id,
        itemId: outcome.autoRollStart.itemId,
      }).achievementAnnouncements ?? []),
    ];
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

  await applyButtonResult(
    interaction,
    createRenderedInteractionResult(
      {
        kind: "update",
        payload: {
          content: buildAutoRollSessionStartingContent(outcome.autoRollStart.reservation),
          components: [],
        },
      },
      achievementAnnouncements,
    ).interactionResult,
  );
  await publishAchievementAnnouncements({
    client: interaction.client,
    announcements: achievementAnnouncements,
  });
};

export const data = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("View and use your inventory items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const inventoryUseCase = createSqliteDiceInventoryUseCase(getDatabase());
  await applyRenderedChatInputResult(
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
