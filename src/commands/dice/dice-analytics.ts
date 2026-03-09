import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../shared/db";
import { getDiceAnalytics } from "../../dice/core/domain/analytics";
import {
  getActiveDicePrestige,
  getDiceLevel,
  getDicePrestige,
} from "../../dice/core/domain/prestige";

export const data = new SlashCommandBuilder()
  .setName("dice-analytics")
  .setDescription("Show your dice progression analytics.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const db = getDatabase();
  const userId = interaction.user.id;
  const nowMs = Date.now();
  const analytics = getDiceAnalytics(db, userId);
  const level = getDiceLevel(db, userId);
  const highestPrestige = getDicePrestige(db, userId);
  const activePrestige = getActiveDicePrestige(db, userId);

  const lines = [
    `Dice analytics for ${interaction.user}:`,
    `Current level: ${level}.`,
    `Time on current level: ${formatElapsed(analytics.levelStartedAt, nowMs)}.`,
    `Roll sets on current level: ${analytics.rollsCurrentLevel}.`,
    `One-off level-up roll sets on current level: ${analytics.nearLevelupRollsCurrentLevel}.`,
    `Active prestige: ${activePrestige}.`,
    `Highest prestige: ${highestPrestige}.`,
    `Time on current prestige: ${formatElapsed(analytics.prestigeStartedAt, nowMs)}.`,
    `Dice rolled on current prestige: ${analytics.diceRolledCurrentPrestige}.`,
    `Total dice rolled: ${analytics.totalDiceRolled}.`,
    `PvP stats: ${analytics.pvpWins}W / ${analytics.pvpLosses}L / ${analytics.pvpDraws}D.`,
  ];

  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: false,
  });
};

const formatElapsed = (startedAtIso: string, nowMs: number): string => {
  const startedAtMs = Date.parse(startedAtIso);
  if (Number.isNaN(startedAtMs)) {
    return "Unknown";
  }

  return formatDuration(Math.max(0, nowMs - startedAtMs));
};

const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${formatUnit(days, "day")} ${formatUnit(hours, "hour")} ${formatUnit(minutes, "minute")}`;
  }
  if (hours > 0) {
    return `${formatUnit(hours, "hour")} ${formatUnit(minutes, "minute")} ${formatUnit(seconds, "second")}`;
  }
  if (minutes > 0) {
    return `${formatUnit(minutes, "minute")} ${formatUnit(seconds, "second")}`;
  }

  return formatUnit(seconds, "second");
};

const formatUnit = (value: number, unit: string): string => {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
};
