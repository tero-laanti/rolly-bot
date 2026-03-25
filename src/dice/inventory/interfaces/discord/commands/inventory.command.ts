import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyRenderedChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { publishAchievementAnnouncements } from "../../../../../app/discord/achievement-announcements";
import { reserveAutoRollSession } from "../../../infrastructure/auto-roller-runtime";
import { getDatabase } from "../../../../../shared/db";
import {
  createSqliteDiceInventoryCommandServices,
  createSqliteDiceInventoryUseCase,
} from "../../../infrastructure/sqlite/services";
import { diceInventoryButtonPrefix, parseDiceInventoryAction } from "../buttons/inventory-buttons";
import { handleAutoRollSessionStart } from "./auto-roll-session.command";
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

  if (
    !(await handleAutoRollSessionStart({
      interaction,
      db,
      autoRollStart: outcome.autoRollStart,
      achievementAnnouncements: outcome.achievementAnnouncements,
      finalizeAutoRollItemUse,
      refundInventoryItem,
    }))
  ) {
    const rendered = renderDiceInventoryResult(outcome.result);
    await applyButtonResult(interaction, rendered.interactionResult);
    await publishAchievementAnnouncements({
      client: interaction.client,
      announcements: outcome.achievementAnnouncements ?? rendered.achievementAnnouncements ?? [],
    });
  }
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
