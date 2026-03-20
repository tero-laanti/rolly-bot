import type { DiceCasinoBetTier, DicePokerHandKind } from "../domain/game-rules";
import type { DiceCasinoGame, DiceCasinoSession } from "../domain/casino-session";

export type DiceCasinoAchievementStats = {
  roundsCompletedTotal: number;
  totalWagered: number;
  highestPayout: number;
  exactFaceWins: number;
  highLowWins: number;
  pushCashouts: number;
  pushPerfectRuns: number;
  blackjackNaturals: number;
  blackjackPushes: number;
  blackjackHitTo21Wins: number;
  pokerStraights: number;
  pokerFullHouses: number;
  pokerFourOfAKind: number;
  pokerFiveOfAKind: number;
  playedExactRoll: boolean;
  playedPushYourLuck: boolean;
  playedBlackjack: boolean;
  playedDicePoker: boolean;
};

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
  wagered: number;
  payout: number;
  outcome: "win" | "loss" | "push";
  achievementEvent?:
    | {
        type: "exact-face-win";
      }
    | {
        type: "high-low-win";
      }
    | {
        type: "push-cashout";
      }
    | {
        type: "push-perfect-run";
      }
    | {
        type: "blackjack-natural";
      }
    | {
        type: "blackjack-push";
      }
    | {
        type: "blackjack-hit-to-21-win";
      }
    | {
        type: "poker-hand";
        handKind: DicePokerHandKind;
      };
};

export type DiceCasinoSessionRepository = {
  getActiveSession: (userId: string, nowMs?: number) => DiceCasinoSession | null;
  saveSession: (session: DiceCasinoSession) => void;
  expireSession: (userId: string) => void;
};

export type DiceCasinoAnalyticsRepository = {
  getAchievementStats: (userId: string) => DiceCasinoAchievementStats;
  recordRoundStarted: (update: DiceCasinoAnalyticsUpdate) => void;
  recordRoundCompleted: (update: DiceCasinoAnalyticsCompletion) => DiceCasinoAchievementStats;
};
