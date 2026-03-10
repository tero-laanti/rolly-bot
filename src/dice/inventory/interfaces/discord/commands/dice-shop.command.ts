import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import {
  createDiceShopReply,
  handleDiceShopAction,
} from "../../../application/manage-shop/use-case";
import { diceShopButtonPrefix, parseDiceShopAction } from "../buttons/shop-buttons";
import { renderDiceShopResult } from "../presenters/shop.presenter";

const handleDiceShopButton = async (interaction: ButtonInteraction): Promise<void> => {
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
    renderDiceShopResult(handleDiceShopAction(getDatabase(), interaction.user.id, action)),
  );
};

export const data = new SlashCommandBuilder()
  .setName("dice-shop")
  .setDescription("Spend your pips on shop items.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await applyChatInputResult(
    interaction,
    renderDiceShopResult(createDiceShopReply(getDatabase(), interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: diceShopButtonPrefix,
    handle: handleDiceShopButton,
  },
];
