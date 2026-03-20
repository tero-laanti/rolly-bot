import {
  getDicePvpChallengeExpireMs,
  getDuelPunishmentMs,
  getDuelRewardMs,
  getDicePvpDieLabel,
  getDicePvpDieSidesForTier,
  getMaxDicePvpTier,
  normalizeDicePvpTier,
} from "./game-rules";

export type DicePvpChallengeStatus = "pending" | "declined" | "expired" | "resolved" | "cancelled";

export type DicePvpEffects = {
  lockoutUntil: string | null;
  doubleRollUntil: string | null;
};

export type DicePvpChallenge = {
  id: string;
  challengerId: string;
  opponentId: string;
  duelTier: number;
  wagerPips: number;
  status: DicePvpChallengeStatus;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
};

export type DicePvpChallengeCreateConflict = "challenger-has-pending" | "opponent-has-pending";

export type DicePvpChallengeCreateResult =
  | { created: true }
  | {
      created: false;
      conflict: DicePvpChallengeCreateConflict;
      challenge: DicePvpChallenge;
    };

export const dicePvpOpenOpponentId = "__open__";

export const isDicePvpChallengeExpired = (
  challenge: DicePvpChallenge,
  nowMs: number = Date.now(),
): boolean => {
  const expiresAtMs = Date.parse(challenge.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }

  return expiresAtMs <= nowMs;
};

export {
  getDicePvpChallengeExpireMs,
  getDuelPunishmentMs,
  getDuelRewardMs,
  getDicePvpDieLabel,
  getDicePvpDieSidesForTier,
  getMaxDicePvpTier,
  normalizeDicePvpTier,
};
