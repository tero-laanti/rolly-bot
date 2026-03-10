import type { DiceAnalyticsRepository } from "../ports";
import type { DiceProgressionRepository } from "../../../progression/application/ports";

export type DiceAnalyticsView = {
  content: string;
  ephemeral: boolean;
};

type QueryDiceAnalyticsDependencies = {
  analytics: Pick<DiceAnalyticsRepository, "getDiceAnalytics">;
  progression: Pick<
    DiceProgressionRepository,
    "getActiveDicePrestige" | "getDiceLevel" | "getDicePrestige"
  >;
};

type QueryDiceAnalyticsInput = {
  userId: string;
  userMention: string;
  nowMs?: number;
};

export const createQueryDiceAnalyticsUseCase = ({
  analytics,
  progression,
}: QueryDiceAnalyticsDependencies) => {
  return ({
    userId,
    userMention,
    nowMs = Date.now(),
  }: QueryDiceAnalyticsInput): DiceAnalyticsView => {
    const analyticsView = analytics.getDiceAnalytics(userId);
    const level = progression.getDiceLevel(userId);
    const highestPrestige = progression.getDicePrestige(userId);
    const activePrestige = progression.getActiveDicePrestige(userId);

    const lines = [
      `Dice analytics for ${userMention}:`,
      `Current level: ${level}.`,
      `Time on current level: ${formatElapsed(analyticsView.levelStartedAt, nowMs)}.`,
      `Roll sets on current level: ${analyticsView.rollsCurrentLevel}.`,
      `One-off level-up roll sets on current level: ${analyticsView.nearLevelupRollsCurrentLevel}.`,
      `Active prestige: ${activePrestige}.`,
      `Highest prestige: ${highestPrestige}.`,
      `Time on current prestige: ${formatElapsed(analyticsView.prestigeStartedAt, nowMs)}.`,
      `Dice rolled on current prestige: ${analyticsView.diceRolledCurrentPrestige}.`,
      `Total dice rolled: ${analyticsView.totalDiceRolled}.`,
      `PvP stats: ${analyticsView.pvpWins}W / ${analyticsView.pvpLosses}L / ${analyticsView.pvpDraws}D.`,
    ];

    return {
      content: lines.join("\n"),
      ephemeral: false,
    };
  };
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
