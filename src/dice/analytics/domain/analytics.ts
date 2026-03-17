import type { DiceCasinoGame } from "../../casino/domain/casino-session";

export type DiceProgressionAnalytics = {
  levelStartedAt: string;
  prestigeStartedAt: string;
  rollsCurrentLevel: number;
  nearLevelupRollsCurrentLevel: number;
  diceRolledCurrentPrestige: number;
  totalDiceRolled: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
};

export type DiceCasinoGameAnalytics = {
  game: DiceCasinoGame;
  roundsCompleted: number;
  wins: number;
  losses: number;
  pushes: number;
  totalWagered: number;
  totalPaidOut: number;
  largestPayout: number;
};

export type DiceCasinoAnalytics = {
  totalRoundsCompleted: number;
  totalWagered: number;
  totalPaidOut: number;
  largestPayout: number;
  games: DiceCasinoGameAnalytics[];
};

export type DiceAnalyticsDashboard = {
  progression: DiceProgressionAnalytics;
  casino: DiceCasinoAnalytics;
};
