import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteDicePvpUseCase } from "../../../infrastructure/sqlite/services";
import { dicePvpButtonPrefix, parseDicePvpAction } from "../buttons/pvp-buttons";
import { renderDicePvpResult, renderDicePvpView } from "../presenters/pvp.presenter";

const handleDicePvpButton = async (interaction: ButtonInteraction): Promise<void> => {
  const pvpUseCase = createSqliteDicePvpUseCase(getDatabase());
  const action = parseDicePvpAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown PvP action.",
        ephemeral: true,
      },
    });
    return;
  }

  const channel = interaction.channel;
  const publishChallenge =
    channel && "send" in channel
      ? async (view: Parameters<typeof renderDicePvpView>[0]) => {
          const challengeMessage = await channel.send(renderDicePvpView(view));
          return { url: challengeMessage.url };
        }
      : null;

  await applyButtonResult(
    interaction,
    renderDicePvpResult(
      await pvpUseCase.handleDicePvpAction(interaction.user.id, action, publishChallenge),
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
  const pvpUseCase = createSqliteDicePvpUseCase(getDatabase());
  const opponent = interaction.options.getUser("opponent");
  await applyChatInputResult(
    interaction,
    renderDicePvpResult(pvpUseCase.createDicePvpSetupReply(interaction.user.id, opponent)),
  );
};

export const buttonHandlers = [
  {
    prefix: dicePvpButtonPrefix,
    handle: handleDicePvpButton,
  },
];
