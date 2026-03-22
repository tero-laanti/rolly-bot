import type { ActionButtonRowSpec } from "../../../../shared-kernel/application/action-view";
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

export type DiceLeaderboardRow = {
  rank: number;
  userId: string;
  summary: string;
};

export type DiceLeaderboardsView = {
  title: string;
  rows: DiceLeaderboardRow[];
  emptyMessage: string;
  components: ActionButtonRowSpec<DiceLeaderboardsAction>[];
};

export type DiceLeaderboardsResult =
  | {
      kind: "reply";
      payload: {
        type: "view";
        view: DiceLeaderboardsView;
        ephemeral: boolean;
      };
    }
  | {
      kind: "update";
      payload: {
        type: "view";
        view: DiceLeaderboardsView;
      };
    };

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
): DiceLeaderboardsView => {
  return {
    title: `**Rolly Leaderboards: Top ${leaderboardSize} ${formatMetricLabel(metric)}**`,
    rows: buildLeaderboardRows(dependencies, metric),
    emptyMessage: "No players are on the leaderboard yet.",
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

const buildLeaderboardRows = (
  dependencies: {
    economy: Pick<DiceEconomyRepository, "getTopBalanceEntries">;
    progression: Pick<DiceProgressionRepository, "getTopPrestigeEntries">;
  },
  metric: EconomyLeaderboardMetric,
): DiceLeaderboardRow[] => {
  if (metric === "prestige") {
    const entries = dependencies.progression.getTopPrestigeEntries(leaderboardSize);
    return entries.map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      summary: formatPrestigeEntry(entry),
    }));
  }

  const entries = dependencies.economy.getTopBalanceEntries({
    metric,
    limit: leaderboardSize,
  });
  return entries.map((entry, index) => ({
    rank: index + 1,
    userId: entry.userId,
    summary: formatEntry(metric, entry),
  }));
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
