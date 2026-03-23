import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteDiceShopUseCase } from "../../../infrastructure/sqlite/services";
import { diceShopButtonPrefix, parseDiceShopAction } from "../buttons/shop-buttons";
import { renderDiceShopResult } from "../presenters/shop.presenter";

const handleDiceShopButton = async (interaction: ButtonInteraction): Promise<void> => {
  const shopUseCase = createSqliteDiceShopUseCase(getDatabase());
  const action = parseDiceShopAction(interaction.customId);
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
