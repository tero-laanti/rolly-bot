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
};
