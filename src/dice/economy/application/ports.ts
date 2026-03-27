import type {
  DailyPipGrantResult,
  EconomyChange,
  EconomyLeaderboardEntry,
  EconomyLeaderboardMetric,
  EconomySnapshot,
  RewardPipGrantResult,
} from "../domain/balance";

export type {
  DailyPipGrantResult,
  EconomyChange,
  EconomyLeaderboardEntry,
  EconomyLeaderboardMetric,
  EconomySnapshot,
  RewardPipGrantResult,
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
  grantRewardPips: (input: { userId: string; baseAmount: number }) => RewardPipGrantResult;
  grantDailyPipsIfEligible: (input: {
    userId: string;
    amount: number;
    nowMs?: number;
  }) => DailyPipGrantResult;
};
