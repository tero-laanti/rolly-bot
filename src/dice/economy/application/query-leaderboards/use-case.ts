import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import type {
  DiceEconomyRepository,
  EconomyLeaderboardEntry,
  EconomyLeaderboardMetric,
} from "../ports";
import type {
  DicePrestigeLeaderboardEntry,
  DiceProgressionRepository,
} from "../../../progression/application/ports";

const leaderboardSize = 10;

export type DiceLeaderboardsAction = {
  type: "metric";
  metric: EconomyLeaderboardMetric;
};

export type DiceLeaderboardsResult = ActionResult<DiceLeaderboardsAction>;

type QueryDiceLeaderboardsDependencies = {
  economy: Pick<DiceEconomyRepository, "getTopBalanceEntries">;
  progression: Pick<DiceProgressionRepository, "getTopPrestigeEntries">;
};

export const createQueryDiceLeaderboardsUseCase = ({
  economy,
  progression,
}: QueryDiceLeaderboardsDependencies) => {
  const createDiceLeaderboardsReply = (): DiceLeaderboardsResult => {
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildLeaderboardsView({ economy, progression }, "pips"),
        ephemeral: false,
      },
    };
  };

  const handleDiceLeaderboardsAction = (action: DiceLeaderboardsAction): DiceLeaderboardsResult => {
    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildLeaderboardsView({ economy, progression }, action.metric),
      },
    };
  };

  return {
    createDiceLeaderboardsReply,
    handleDiceLeaderboardsAction,
  };
};

const buildLeaderboardsView = (
  dependencies: {
    economy: Pick<DiceEconomyRepository, "getTopBalanceEntries">;
    progression: Pick<DiceProgressionRepository, "getTopPrestigeEntries">;
  },
  metric: EconomyLeaderboardMetric,
): ActionView<DiceLeaderboardsAction> => {
  return {
    content: buildLeaderboardsContent(dependencies, metric),
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
        {
          action: { type: "metric", metric: "prestige" },
          label: "Top Prestige",
          style: metric === "prestige" ? "primary" : "secondary",
          disabled: metric === "prestige",
        },
      ],
    ],
  };
};

const buildLeaderboardsContent = (
  dependencies: {
    economy: Pick<DiceEconomyRepository, "getTopBalanceEntries">;
    progression: Pick<DiceProgressionRepository, "getTopPrestigeEntries">;
  },
  metric: EconomyLeaderboardMetric,
): string => {
  const lines = buildLeaderboardLines(dependencies, metric);

  return [
    `**Rolly Leaderboards: Top ${leaderboardSize} ${formatMetricLabel(metric)}**`,
    "",
    ...lines,
  ].join("\n");
};

const buildLeaderboardLines = (
  dependencies: {
    economy: Pick<DiceEconomyRepository, "getTopBalanceEntries">;
    progression: Pick<DiceProgressionRepository, "getTopPrestigeEntries">;
  },
  metric: EconomyLeaderboardMetric,
): string[] => {
  if (metric === "prestige") {
    const entries = dependencies.progression.getTopPrestigeEntries(leaderboardSize);
    return entries.length > 0
      ? entries.map(
          (entry, index) => `${index + 1}. ${entry.userId} - ${formatPrestigeEntry(entry)}`,
        )
      : ["No players are on the leaderboard yet."];
  }

  const entries = dependencies.economy.getTopBalanceEntries({
    metric,
    limit: leaderboardSize,
  });
  return entries.length > 0
    ? entries.map((entry, index) => `${index + 1}. ${entry.userId} - ${formatEntry(metric, entry)}`)
    : ["No players are on the leaderboard yet."];
};

const formatEntry = (metric: "fame" | "pips", entry: EconomyLeaderboardEntry): string => {
  if (metric === "fame") {
    return `${entry.fame} Fame | ${entry.pips} Pips`;
  }

  return `${entry.pips} Pips | ${entry.fame} Fame`;
};

const formatPrestigeEntry = (entry: DicePrestigeLeaderboardEntry): string => {
  return `Prestige ${entry.prestige} | Level ${entry.level}`;
};

const formatMetricLabel = (metric: EconomyLeaderboardMetric): string => {
  if (metric === "fame") {
    return "Fame";
  }

  if (metric === "prestige") {
    return "Prestige";
  }

  return "Pips";
};
