import { SlashCommandBuilder } from "discord.js";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
  applyStringSelectMenuResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteDiceShopUseCase } from "../../../infrastructure/sqlite/services";
import { diceShopButtonPrefix, parseDiceShopButtonAction } from "../buttons/shop-buttons";
import { renderDiceShopResult } from "../presenters/shop.presenter";
import {
  diceShopSelectMenuPrefix,
  parseDiceShopSelectMenuAction,
} from "../select-menus/shop-select-menus";

const handleDiceShopButton = async (interaction: ButtonInteraction): Promise<void> => {
  const shopUseCase = createSqliteDiceShopUseCase(getDatabase());
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

  await applyButtonResult(
    interaction,
    renderDiceShopResult(shopUseCase.handleDiceShopAction(interaction.user.id, action)),
  );
};

const handleDiceShopSelectMenu = async (
  interaction: StringSelectMenuInteraction,
): Promise<void> => {
  const shopUseCase = createSqliteDiceShopUseCase(getDatabase());
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

  await applyStringSelectMenuResult(
    interaction,
    renderDiceShopResult(shopUseCase.handleDiceShopAction(interaction.user.id, action)),
  );
};

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Spend your pips on shop items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const shopUseCase = createSqliteDiceShopUseCase(getDatabase());
  await applyChatInputResult(
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
