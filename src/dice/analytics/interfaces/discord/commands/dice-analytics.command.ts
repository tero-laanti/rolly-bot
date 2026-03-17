import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteQueryDiceAnalyticsUseCase } from "../../../infrastructure/sqlite/services";
import { renderDiceAnalyticsResult } from "../presenters/analytics.presenter";

export const data = new SlashCommandBuilder()
  .setName("dice-analytics")
  .setDescription("Show your dice and casino analytics.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const queryDiceAnalytics = createSqliteQueryDiceAnalyticsUseCase(getDatabase());
  await applyChatInputResult(
    interaction,
    renderDiceAnalyticsResult(
      queryDiceAnalytics({
        userId: interaction.user.id,
        userMention: interaction.user.toString(),
        nowMs: Date.now(),
      }),
    ),
  );
};
