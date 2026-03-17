import type { DiceCasinoBetTier } from "../domain/game-rules";
import type { DiceCasinoGame, DiceCasinoSession } from "../domain/casino-session";

export type DiceCasinoAnalyticsUpdate = {
  userId: string;
  game: DiceCasinoGame;
  betTier: DiceCasinoBetTier;
  wagered: number;
};

export type DiceCasinoAnalyticsCompletion = {
  userId: string;
  game: DiceCasinoGame;
  betTier: DiceCasinoBetTier;
  payout: number;
  outcome: "win" | "loss" | "push";
};

export type DiceCasinoSessionRepository = {
  getActiveSession: (userId: string, nowMs?: number) => DiceCasinoSession | null;
  saveSession: (session: DiceCasinoSession) => void;
  expireSession: (userId: string) => void;
};

export type DiceCasinoAnalyticsRepository = {
  recordRoundStarted: (update: DiceCasinoAnalyticsUpdate) => void;
  recordRoundCompleted: (update: DiceCasinoAnalyticsCompletion) => void;
};
