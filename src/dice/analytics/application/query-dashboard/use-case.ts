import type { DiceAnalyticsRepository } from "../ports";
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import { formatDurationWords } from "../../../../shared/text";

export type DiceAnalyticsView = {
  content: string;
  ephemeral: boolean;
};

type QueryDiceAnalyticsDependencies = {
  analytics: Pick<DiceAnalyticsRepository, "getDiceAnalytics">;
  progression: Pick<
    DiceProgressionRepository,
    "getActiveDicePrestige" | "getDiceCount" | "getDicePrestige"
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
    const diceCount = progression.getDiceCount(userId);
    const highestPrestige = progression.getDicePrestige(userId);
    const activePrestige = progression.getActiveDicePrestige(userId);

    const lines = [
      `Dice analytics for ${userMention}:`,
      `Current dice: ${diceCount}.`,
      `Time at current dice count: ${formatElapsed(analyticsView.diceCountStartedAt, nowMs)}.`,
      `Roll sets at current dice count: ${analyticsView.rollSetsCurrentDiceCount}.`,
      `One-off roll sets at current dice count: ${analyticsView.nearDiceCountIncreaseRollSetsCurrentDiceCount}.`,
      `Active prestige: ${activePrestige}.`,
      `Highest prestige: ${highestPrestige}.`,
      `Time on current prestige: ${formatElapsed(analyticsView.prestigeStartedAt, nowMs)}.`,
      `Dice rolled on current prestige: ${analyticsView.diceRolledCurrentPrestige}.`,
      `Total dice rolled: ${analyticsView.totalDiceRolled}.`,
      `Total dice sets rolled: ${analyticsView.totalDiceSetsRolled}.`,
      `Total /roll calls: ${analyticsView.totalRollCommandsCalled}.`,
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

  return formatDurationWords(Math.max(0, nowMs - startedAtMs), { includeDays: true });
};
