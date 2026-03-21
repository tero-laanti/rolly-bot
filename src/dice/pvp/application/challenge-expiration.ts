import type { UnitOfWork } from "../../../shared-kernel/application/unit-of-work";
import type { DiceEconomyRepository } from "../../economy/application/ports";
import type { DicePvpChallenge } from "../domain/pvp";
import type { DicePvpRepository } from "./ports";

export const refundChallengeChallenger = (
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">,
  challenge: DicePvpChallenge,
): void => {
  if (challenge.wagerPips < 1) {
    return;
  }

  economy.applyPipsDelta({
    userId: challenge.challengerId,
    amount: challenge.wagerPips,
  });
};

export const expireExpiredPendingChallengesForUsers = ({
  economy,
  pvp,
  userIds,
  nowMs,
}: {
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">;
  pvp: Pick<DicePvpRepository, "expireExpiredPendingDicePvpChallengesForUser">;
  userIds: string[];
  nowMs: number;
}): void => {
  const expiredChallenges = new Map<string, DicePvpChallenge>();

  for (const userId of new Set(userIds)) {
    for (const challenge of pvp.expireExpiredPendingDicePvpChallengesForUser(userId, nowMs)) {
      expiredChallenges.set(challenge.id, challenge);
    }
  }

  for (const challenge of expiredChallenges.values()) {
    refundChallengeChallenger(economy, challenge);
  }
};

export const cancelLockedPendingChallengesForUsers = ({
  economy,
  pvp,
  userIds,
  nowMs,
}: {
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">;
  pvp: Pick<DicePvpRepository, "cancelLockedPendingDicePvpChallengesForUser">;
  userIds: string[];
  nowMs: number;
}): void => {
  const cancelledChallenges = new Map<string, DicePvpChallenge>();

  for (const userId of new Set(userIds)) {
    for (const challenge of pvp.cancelLockedPendingDicePvpChallengesForUser(userId, nowMs)) {
      cancelledChallenges.set(challenge.id, challenge);
    }
  }

  for (const challenge of cancelledChallenges.values()) {
    refundChallengeChallenger(economy, challenge);
  }
};

export const expireExpiredPendingChallenges = ({
  economy,
  pvp,
  unitOfWork,
  nowMs,
}: {
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">;
  pvp: Pick<DicePvpRepository, "expireExpiredPendingDicePvpChallenges">;
  unitOfWork: UnitOfWork;
  nowMs: number;
}): DicePvpChallenge[] => {
  return unitOfWork.runInTransaction(() => {
    const expiredChallenges = pvp.expireExpiredPendingDicePvpChallenges(nowMs);

    for (const challenge of expiredChallenges) {
      refundChallengeChallenger(economy, challenge);
    }

    return expiredChallenges;
  });
};
