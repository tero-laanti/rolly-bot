import type { DiceLeaderboardsAction } from "../../../application/query-leaderboards/use-case";
import type { EconomyLeaderboardMetric } from "../../../application/ports";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceLeaderboardsButtonPrefix = "dice-leaderboards:";

export const encodeDiceLeaderboardsAction = (action: DiceLeaderboardsAction): string => {
  return encodeActionId(diceLeaderboardsButtonPrefix, action.type, action.metric);
};

const isLeaderboardMetric = (value: string): value is EconomyLeaderboardMetric => {
  return value === "fame" || value === "pips" || value === "prestige";
};

export const parseDiceLeaderboardsAction = (customId: string): DiceLeaderboardsAction | null => {
  const parsed = parseActionId(customId, diceLeaderboardsButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, metric] = parsed;
  if (action !== "metric" || !metric || !isLeaderboardMetric(metric)) {
    return null;
  }

  return {
    type: "metric",
    metric,
  };
};
