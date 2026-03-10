import type { SqliteDatabase } from "../../../../shared/db";
import type { DicePvpRepository } from "../../application/ports";
import {
  createDicePvpChallengeIfUsersAvailable,
  getActiveDiceLockout,
  getActiveDoubleRoll,
  getDicePvpChallenge,
  getDicePvpEffects,
  setDicePvpChallengeOpponentFromOpen,
  setDicePvpChallengeStatusFromPending,
  setDicePvpEffects,
} from "../../domain/pvp";

export const createSqlitePvpRepository = (db: SqliteDatabase): DicePvpRepository => {
  return {
    getDicePvpEffects: (userId) => getDicePvpEffects(db, userId),
    setDicePvpEffects: (update) => setDicePvpEffects(db, update),
    getActiveDiceLockout: (userId, nowMs) => getActiveDiceLockout(db, userId, nowMs),
    getActiveDoubleRoll: (userId, nowMs) => getActiveDoubleRoll(db, userId, nowMs),
    createDicePvpChallengeIfUsersAvailable: (challenge) =>
      createDicePvpChallengeIfUsersAvailable(db, challenge),
    getDicePvpChallenge: (challengeId) => getDicePvpChallenge(db, challengeId),
    setDicePvpChallengeOpponentFromOpen: (challengeId, opponentId) =>
      setDicePvpChallengeOpponentFromOpen(db, challengeId, opponentId),
    setDicePvpChallengeStatusFromPending: (challengeId, status) =>
      setDicePvpChallengeStatusFromPending(db, challengeId, status),
  };
};
