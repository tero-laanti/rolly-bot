import type {
  DicePvpChallenge,
  DicePvpChallengeCreateResult,
  DicePvpChallengeStatus,
  DicePvpEffects,
} from "../domain/pvp";

export type DicePvpEffectsUpdate = {
  userId: string;
  lockoutUntil?: string | null;
  doubleRollUntil?: string | null;
};

export type DicePvpChallengeCreate = {
  id: string;
  challengerId: string;
  opponentId: string;
  duelTier: number;
  expiresAt: string;
};

export type DicePvpChallengeCreateIfAvailable = DicePvpChallengeCreate & {
  nowMs?: number;
};

export type DicePvpAchievementStats = {
  duelsTotal: number;
  currentWinStreak: number;
  highestWinStreak: number;
  highestTierWin: number;
};

export type DicePvpResolvedDuelUpdate = {
  userId: string;
  duelTier: number;
  result: "win" | "loss" | "draw";
};

export type DicePvpRepository = {
  getDicePvpEffects: (userId: string) => DicePvpEffects;
  setDicePvpEffects: (update: DicePvpEffectsUpdate) => void;
  getActiveDiceLockout: (userId: string, nowMs?: number) => number | null;
  getActiveDoubleRoll: (userId: string, nowMs?: number) => number | null;
  createDicePvpChallengeIfUsersAvailable: (
    challenge: DicePvpChallengeCreateIfAvailable,
  ) => DicePvpChallengeCreateResult;
  getDicePvpChallenge: (challengeId: string) => DicePvpChallenge | undefined;
  setDicePvpChallengeOpponentFromOpen: (challengeId: string, opponentId: string) => boolean;
  setDicePvpChallengeStatusFromPending: (
    challengeId: string,
    status: DicePvpChallengeStatus,
  ) => boolean;
  getDicePvpAchievementStats: (userId: string) => DicePvpAchievementStats;
  recordResolvedDuel: (update: DicePvpResolvedDuelUpdate) => DicePvpAchievementStats;
};
