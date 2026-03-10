import type { DiceAnalytics } from "../domain/analytics";

export type DiceRollAnalyticsUpdate = {
  userId: string;
  rollSetCount: number;
  nearLevelupRollCount: number;
  diceRolledCount: number;
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
  resetDiceLevelAnalyticsProgress: (userId: string) => void;
  resetDicePrestigeAnalyticsProgress: (userId: string) => void;
  updateDicePvpStats: (update: DicePvpStatsUpdate) => void;
};
