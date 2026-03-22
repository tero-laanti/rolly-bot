import type {
  DailyPipGrantResult,
  EconomyChange,
  EconomyLeaderboardEntry,
  EconomyLeaderboardMetric,
  EconomySnapshot,
} from "../domain/balance";

export type {
  DailyPipGrantResult,
  EconomyChange,
  EconomyLeaderboardEntry,
  EconomyLeaderboardMetric,
  EconomySnapshot,
} from "../domain/balance";

export type DiceEconomyRepository = {
  getEconomySnapshot: (userId: string) => EconomySnapshot;
  getTopBalanceEntries: (input: {
    metric: Exclude<EconomyLeaderboardMetric, "prestige">;
    limit: number;
  }) => EconomyLeaderboardEntry[];
  getFame: (userId: string) => number;
  getPips: (userId: string) => number;
  getLastDailyPipRewardAt: (userId: string) => string | null;
  applyFameDelta: (change: EconomyChange) => number;
  applyPipsDelta: (change: EconomyChange) => number;
  grantDailyPipsIfEligible: (input: {
    userId: string;
    amount: number;
    nowMs?: number;
  }) => DailyPipGrantResult;
};
