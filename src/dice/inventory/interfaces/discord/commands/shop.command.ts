import { SlashCommandBuilder } from "discord.js";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import {
  applyButtonResult,
  applyRenderedButtonResult,
  applyRenderedChatInputResult,
  applyRenderedStringSelectMenuResult,
  applyStringSelectMenuResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { reserveAutoRollSession } from "../../../infrastructure/auto-roller-runtime";
import {
  createSqliteDiceShopCommandServices,
  createSqliteDiceShopUseCase,
} from "../../../infrastructure/sqlite/services";
import { diceShopButtonPrefix, parseDiceShopButtonAction } from "../buttons/shop-buttons";
import { handleAutoRollSessionStart } from "./auto-roll-session.command";
import { renderDiceShopResult } from "../presenters/shop.presenter";
import {
  diceShopSelectMenuPrefix,
  parseDiceShopSelectMenuAction,
} from "../select-menus/shop-select-menus";

const handleDiceShopButton = async (interaction: ButtonInteraction): Promise<void> => {
  const db = getDatabase();
  const { shopUseCase, finalizeAutoRollItemUse, refundInventoryItem, triggerRandomGroupEvent } =
    createSqliteDiceShopCommandServices(db);
  const action = parseDiceShopButtonAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown shop action.",
        ephemeral: true,
      },
    });
    return;
  }

  const outcome = await shopUseCase.handleDiceShopAction(interaction.user.id, action, {
    reserveAutoRollSession,
    triggerRandomGroupEvent,
  });
  if (
    await handleAutoRollSessionStart({
      interaction,
      db,
      autoRollStart: outcome.autoRollStart,
      achievementAnnouncements: outcome.result.achievementAnnouncements,
      finalizeAutoRollItemUse,
      refundInventoryItem,
    })
  ) {
    return;
  }

  await applyRenderedButtonResult(interaction, renderDiceShopResult(outcome.result));
};

const handleDiceShopSelectMenu = async (
  interaction: StringSelectMenuInteraction,
): Promise<void> => {
  const { shopUseCase, triggerRandomGroupEvent } =
    createSqliteDiceShopCommandServices(getDatabase());
  const action = parseDiceShopSelectMenuAction(interaction.customId, interaction.values);
  if (!action) {
    await applyStringSelectMenuResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown shop selection.",
        ephemeral: true,
      },
    });
    return;
  }

  await applyRenderedStringSelectMenuResult(
    interaction,
    renderDiceShopResult(
      (
        await shopUseCase.handleDiceShopAction(interaction.user.id, action, {
          reserveAutoRollSession,
          triggerRandomGroupEvent,
        })
      ).result,
    ),
  );
};

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Spend your pips on shop items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const shopUseCase = createSqliteDiceShopUseCase(getDatabase());
  await applyRenderedChatInputResult(
    interaction,
    renderDiceShopResult(shopUseCase.createDiceShopReply(interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: diceShopButtonPrefix,
    handle: handleDiceShopButton,
  },
];

export const stringSelectMenuHandlers = [
  {
    prefix: diceShopSelectMenuPrefix,
    handle: handleDiceShopSelectMenu,
  },
];
