import type { DiceAnalytics } from "../domain/analytics";

export type DiceRollAnalyticsUpdate = {
  userId: string;
  rollSetCount: number;
  nearDiceCountIncreaseRollCount: number;
  diceRolledCount: number;
  rollCommandCount: number;
};

export type DicePvpStatsUpdate = {
  userId: string;
  wins?: number;
  losses?: number;
  draws?: number;
};

export type DiceAnalyticsRepository = {
  getDiceAnalytics: (userId: string) => DiceAnalytics;
  recordDiceRollAnalytics: (update: DiceRollAnalyticsUpdate) => void;
  resetDiceCountAnalyticsProgress: (userId: string) => void;
  resetDicePrestigeAnalyticsProgress: (userId: string) => void;
  updateDicePvpStats: (update: DicePvpStatsUpdate) => void;
};
