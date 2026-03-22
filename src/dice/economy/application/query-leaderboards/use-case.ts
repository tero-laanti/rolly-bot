import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import type {
  DiceEconomyRepository,
  EconomyLeaderboardEntry,
  EconomyLeaderboardMetric,
} from "../ports";

const leaderboardSize = 10;

export type DiceLeaderboardsAction = {
  type: "metric";
  metric: EconomyLeaderboardMetric;
};

export type DiceLeaderboardsResult = ActionResult<DiceLeaderboardsAction>;

type QueryDiceLeaderboardsDependencies = {
  economy: Pick<DiceEconomyRepository, "getTopBalanceEntries">;
};

export const createQueryDiceLeaderboardsUseCase = ({
  economy,
}: QueryDiceLeaderboardsDependencies) => {
  const createDiceLeaderboardsReply = (): DiceLeaderboardsResult => {
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildLeaderboardsView(economy, "pips"),
        ephemeral: false,
      },
    };
  };

  const handleDiceLeaderboardsAction = (action: DiceLeaderboardsAction): DiceLeaderboardsResult => {
    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildLeaderboardsView(economy, action.metric),
      },
    };
  };

  return {
    createDiceLeaderboardsReply,
    handleDiceLeaderboardsAction,
  };
};

const buildLeaderboardsView = (
  economy: Pick<DiceEconomyRepository, "getTopBalanceEntries">,
  metric: EconomyLeaderboardMetric,
): ActionView<DiceLeaderboardsAction> => {
  const entries = economy.getTopBalanceEntries({
    metric,
    limit: leaderboardSize,
  });

  return {
    content: buildLeaderboardsContent(metric, entries),
    components: [
      [
        {
          action: { type: "metric", metric: "pips" },
          label: "Top Pips",
          style: metric === "pips" ? "primary" : "secondary",
          disabled: metric === "pips",
        },
        {
          action: { type: "metric", metric: "fame" },
          label: "Top Fame",
          style: metric === "fame" ? "primary" : "secondary",
          disabled: metric === "fame",
        },
      ],
    ],
  };
};

const buildLeaderboardsContent = (
  metric: EconomyLeaderboardMetric,
  entries: EconomyLeaderboardEntry[],
): string => {
  const lines =
    entries.length > 0
      ? entries.map(
          (entry, index) => `${index + 1}. <@${entry.userId}> - ${formatEntry(metric, entry)}`,
        )
      : ["No players are on the leaderboard yet."];

  return [
    `**Rolly Leaderboards: Top ${leaderboardSize} ${formatMetricLabel(metric)}**`,
    "",
    ...lines,
  ].join("\n");
};

const formatEntry = (metric: EconomyLeaderboardMetric, entry: EconomyLeaderboardEntry): string => {
  if (metric === "fame") {
    return `${entry.fame} Fame | ${entry.pips} Pips`;
  }

  return `${entry.pips} Pips | ${entry.fame} Fame`;
};

const formatMetricLabel = (metric: EconomyLeaderboardMetric): string => {
  return metric === "fame" ? "Fame" : "Pips";
};
