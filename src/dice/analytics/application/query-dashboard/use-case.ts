import type { DiceAnalyticsRepository } from "../ports";
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import type { DiceCasinoAnalytics, DiceProgressionAnalytics } from "../../domain/analytics";
import { getDiceCasinoGameLabel } from "../../../casino/domain/game-rules";

export type DiceAnalyticsSectionView = {
  heading?: string;
  lines: string[];
};

export type DiceAnalyticsDashboardView = {
  title: string;
  sections: DiceAnalyticsSectionView[];
  ephemeral: boolean;
};

type QueryDiceAnalyticsDependencies = {
  analytics: Pick<
    DiceAnalyticsRepository,
    "getDiceProgressionAnalytics" | "getDiceCasinoAnalytics"
  >;
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
  }: QueryDiceAnalyticsInput): DiceAnalyticsDashboardView => {
    const progressionAnalytics = analytics.getDiceProgressionAnalytics(userId);
    const casinoAnalytics = analytics.getDiceCasinoAnalytics(userId);
    const level = progression.getDiceLevel(userId);
    const highestPrestige = progression.getDicePrestige(userId);
    const activePrestige = progression.getActiveDicePrestige(userId);

    return {
      title: `Dice analytics for ${userMention}:`,
      sections: [
        {
          lines: buildProgressionSectionLines({
            activePrestige,
            analytics: progressionAnalytics,
            highestPrestige,
            level,
            nowMs,
          }),
        },
        {
          heading: "Casino",
          lines: buildCasinoSectionLines(casinoAnalytics),
        },
      ],
      ephemeral: false,
    };
  };
};

type BuildProgressionSectionLinesInput = {
  analytics: DiceProgressionAnalytics;
  level: number;
  activePrestige: number;
  highestPrestige: number;
  nowMs: number;
};

const buildProgressionSectionLines = ({
  analytics,
  level,
  activePrestige,
  highestPrestige,
  nowMs,
}: BuildProgressionSectionLinesInput): string[] => {
  return [
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
};

const buildCasinoSectionLines = (analytics: DiceCasinoAnalytics): string[] => {
  const hasCasinoActivity =
    analytics.totalRoundsCompleted > 0 ||
    analytics.totalWagered > 0 ||
    analytics.totalPaidOut > 0 ||
    analytics.largestPayout > 0;

  if (!hasCasinoActivity) {
    return ["No casino rounds recorded yet."];
  }

  const lines = [
    `Rounds completed: ${analytics.totalRoundsCompleted}.`,
    `Total wagered: ${analytics.totalWagered}.`,
    `Total paid out: ${analytics.totalPaidOut}.`,
    `Net result: ${formatNetPips(analytics.totalPaidOut - analytics.totalWagered)}.`,
    `Best payout: ${analytics.largestPayout}.`,
  ];

  for (const game of analytics.games) {
    lines.push(
      "",
      `${getDiceCasinoGameLabel(game.game)}: ${game.roundsCompleted} rounds, ${game.wins}W / ${game.losses}L / ${game.pushes}D, wagered ${game.totalWagered}, paid ${game.totalPaidOut}, net ${formatNetPips(game.totalPaidOut - game.totalWagered)}, best ${game.largestPayout}.`,
    );
  }

  return lines;
};

const formatNetPips = (value: number): string => {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
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
