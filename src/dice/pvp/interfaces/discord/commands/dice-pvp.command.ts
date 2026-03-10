import { SlashCommandBuilder } from "discord.js";
import type {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { applyButtonResult, applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import {
  createDicePvpSetupReply,
  dicePvpButtonPrefix,
  handleDicePvpAction,
} from "../../../application/manage-challenge/use-case";

const handleDicePvpButton = async (interaction: ButtonInteraction): Promise<void> => {
  const channel = interaction.channel;
  const publishChallenge =
    channel && "send" in channel
      ? async (message: { content: string; components: ActionRowBuilder<ButtonBuilder>[] }) => {
          const challengeMessage = await channel.send(message);
          return { url: challengeMessage.url };
        }
      : null;

  await applyButtonResult(
    interaction,
    await handleDicePvpAction(
      getDatabase(),
      interaction.user.id,
      interaction.customId,
      publishChallenge,
    ),
  );
};

export const data = new SlashCommandBuilder()
  .setName("dice-pvp")
  .setDescription("Challenge another user to a dice duel.")
  .addUserOption((option) =>
    option.setName("opponent").setDescription("The user you want to challenge.").setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const opponent = interaction.options.getUser("opponent");
  await applyChatInputResult(
    interaction,
    createDicePvpSetupReply(getDatabase(), interaction.user.id, opponent),
  );
};

export const buttonHandlers = [
  {
    prefix: dicePvpButtonPrefix,
    handle: handleDicePvpButton,
  },
];
