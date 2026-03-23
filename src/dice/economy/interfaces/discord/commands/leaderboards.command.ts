import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { createUserDisplayNameResolver } from "../../../../../app/discord/resolve-user-display-name";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteQueryDiceLeaderboardsUseCase } from "../../../infrastructure/sqlite/services";
import {
  diceLeaderboardsButtonPrefix,
  parseDiceLeaderboardsAction,
} from "../buttons/leaderboards-buttons";
import { renderDiceLeaderboardsResult } from "../presenters/leaderboards.presenter";

const handleDiceLeaderboardsButton = async (interaction: ButtonInteraction): Promise<void> => {
  const action = parseDiceLeaderboardsAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown leaderboard action.",
        ephemeral: true,
      },
    });
    return;
  }

  const queryDiceLeaderboards = createSqliteQueryDiceLeaderboardsUseCase(getDatabase());
  await applyButtonResult(
    interaction,
    await renderDiceLeaderboardsResult(
      queryDiceLeaderboards.handleDiceLeaderboardsAction(action),
      createUserDisplayNameResolver({
        client: interaction.client,
        guild: interaction.guild,
      }),
    ),
  );
};

export const data = new SlashCommandBuilder()
  .setName("leaderboards")
  .setDescription("Show the top Fame, Pips, and Prestige rankings.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const queryDiceLeaderboards = createSqliteQueryDiceLeaderboardsUseCase(getDatabase());
  await applyChatInputResult(
    interaction,
    await renderDiceLeaderboardsResult(
      queryDiceLeaderboards.createDiceLeaderboardsReply(),
      createUserDisplayNameResolver({
        client: interaction.client,
        guild: interaction.guild,
      }),
    ),
  );
};

export const buttonHandlers = [
  {
    prefix: diceLeaderboardsButtonPrefix,
    handle: handleDiceLeaderboardsButton,
  },
];
