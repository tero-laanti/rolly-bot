import assert from "node:assert/strict";
import test from "node:test";
import type { DicePvpChallenge } from "../domain/pvp";
import {
  cancelLockedPendingChallengesForUsers,
  expireExpiredPendingChallenges,
} from "./challenge-expiration";

test("expireExpiredPendingChallenges refunds expired wager escrows without user interaction", () => {
  const balances = new Map<string, number>([["challenger", 13]]);
  const challenges = new Map<string, DicePvpChallenge>([
    [
      "challenge-1",
      {
        id: "challenge-1",
        challengerId: "challenger",
        opponentId: "opponent",
        duelTier: 1,
        wagerPips: 7,
        status: "pending",
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString(),
        expiresAt: new Date(Date.UTC(2026, 0, 1, 12, 5, 0)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString(),
      },
    ],
  ]);

  const result = expireExpiredPendingChallenges({
    economy: {
      applyPipsDelta: ({ userId, amount }) => {
        const next = (balances.get(userId) ?? 0) + amount;
        balances.set(userId, next);
        return next;
      },
    },
    pvp: {
      expireExpiredPendingDicePvpChallenges: (nowMs = Date.now()) => {
        const expiredChallenges: DicePvpChallenge[] = [];

        for (const challenge of challenges.values()) {
          if (challenge.status !== "pending" || Date.parse(challenge.expiresAt) > nowMs) {
            continue;
          }

          const expiredChallenge = {
            ...challenge,
            status: "expired" as const,
            updatedAt: new Date(nowMs).toISOString(),
          };
          challenges.set(challenge.id, expiredChallenge);
          expiredChallenges.push(expiredChallenge);
        }

        return expiredChallenges;
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
    nowMs: Date.UTC(2026, 0, 1, 12, 10, 0),
  });

  assert.equal(result.length, 1);
  assert.equal(challenges.get("challenge-1")?.status, "expired");
  assert.equal(balances.get("challenger"), 20);

  const secondSweep = expireExpiredPendingChallenges({
    economy: {
      applyPipsDelta: ({ userId, amount }) => {
        const next = (balances.get(userId) ?? 0) + amount;
        balances.set(userId, next);
        return next;
      },
    },
    pvp: {
      expireExpiredPendingDicePvpChallenges: () => [],
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
    nowMs: Date.UTC(2026, 0, 1, 12, 11, 0),
  });

  assert.equal(secondSweep.length, 0);
  assert.equal(balances.get("challenger"), 20);
});

test("cancelLockedPendingChallengesForUsers refunds wager escrow once per locked challenge", () => {
  const nowMs = Date.UTC(2026, 0, 1, 12, 10, 0);
  const balances = new Map<string, number>([["challenger", 13]]);
  const challenges = new Map<string, DicePvpChallenge>([
    [
      "challenge-1",
      {
        id: "challenge-1",
        challengerId: "challenger",
        opponentId: "opponent",
        duelTier: 1,
        wagerPips: 7,
        status: "pending",
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString(),
        expiresAt: new Date(Date.UTC(2026, 0, 1, 12, 15, 0)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString(),
      },
    ],
  ]);

  cancelLockedPendingChallengesForUsers({
    economy: {
      applyPipsDelta: ({ userId, amount }) => {
        const next = (balances.get(userId) ?? 0) + amount;
        balances.set(userId, next);
        return next;
      },
    },
    pvp: {
      cancelLockedPendingDicePvpChallengesForUser: (userId) => {
        const challenge = challenges.get("challenge-1");
        if (
          !challenge ||
          challenge.status !== "pending" ||
          (challenge.challengerId !== userId && challenge.opponentId !== userId)
        ) {
          return [];
        }

        const cancelledChallenge = {
          ...challenge,
          status: "cancelled" as const,
          updatedAt: new Date(nowMs).toISOString(),
        };
        challenges.set(challenge.id, cancelledChallenge);
        return [cancelledChallenge];
      },
    },
    userIds: ["challenger", "opponent"],
    nowMs,
  });

  assert.equal(challenges.get("challenge-1")?.status, "cancelled");
  assert.equal(balances.get("challenger"), 20);
});
