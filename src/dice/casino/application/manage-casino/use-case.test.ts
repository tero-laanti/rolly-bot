import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultDiceCasinoSessionState,
  type DiceCasinoSession,
} from "../../domain/casino-session";
import { createDiceCasinoUseCase } from "./use-case";

const emptyAchievementStats = {
  roundsCompletedTotal: 0,
  totalWagered: 0,
  highestPayout: 0,
  exactFaceWins: 0,
  highLowWins: 0,
  pushCashouts: 0,
  pushPerfectRuns: 0,
  blackjackNaturals: 0,
  blackjackPushes: 0,
  blackjackHitTo21Wins: 0,
  pokerStraights: 0,
  pokerFullHouses: 0,
  pokerFourOfAKind: 0,
  pokerFiveOfAKind: 0,
  playedExactRoll: false,
  playedPushYourLuck: false,
  playedBlackjack: false,
  playedDicePoker: false,
};

test("completed casino rounds record contract progress", () => {
  const nowMs = Date.UTC(2026, 2, 27, 12, 0, 0);
  const recordedEvents: Array<{ userId: string; occurredAt: Date }> = [];
  let balance = 50;
  let activeSession: DiceCasinoSession | null = {
    userId: "casino-user",
    bet: 10,
    state: {
      ...createDefaultDiceCasinoSessionState("session-1"),
      currentScreen: "setup",
      selectedGame: "exact-roll",
      exactRollMode: "exact-face",
      exactRollFace: 2,
    },
    expiresAt: new Date(nowMs + 60_000).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };

  const useCase = createDiceCasinoUseCase({
    analytics: {
      getAchievementStats: () => emptyAchievementStats,
      recordRoundStarted: () => {},
      recordRoundCompleted: () => emptyAchievementStats,
    },
    contracts: {
      recordCasinoGameCompletion: (event) => {
        recordedEvents.push(event);
        return null;
      },
    },
    economy: {
      getPips: () => balance,
      applyPipsDelta: ({ amount }) => {
        balance += amount;
        return balance;
      },
      grantRewardPips: ({ baseAmount }) => {
        balance += baseAmount;
        return {
          awardedAmount: baseAmount,
          pips: balance,
        };
      },
    },
    progression: {
      awardAchievements: () => [],
    },
    sessions: {
      getActiveSession: () => activeSession,
      saveSession: (session) => {
        activeSession = session;
      },
      expireSession: () => {
        activeSession = null;
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase.handleDiceCasinoAction(
    "casino-user",
    {
      type: "exact-face",
      ownerId: "casino-user",
      face: 2,
      sessionToken: "session-1",
    },
    nowMs,
  );

  assert.equal(result.kind, "update");
  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0]?.userId, "casino-user");
  assert.equal(recordedEvents[0]?.occurredAt.getTime(), nowMs);
});

test("completed casino rounds surface contract completion announcements", () => {
  const nowMs = Date.UTC(2026, 2, 27, 12, 0, 0);
  let balance = 50;
  let activeSession: DiceCasinoSession | null = {
    userId: "casino-user",
    bet: 10,
    state: {
      ...createDefaultDiceCasinoSessionState("session-1"),
      currentScreen: "setup",
      selectedGame: "exact-roll",
      exactRollMode: "exact-face",
      exactRollFace: 2,
    },
    expiresAt: new Date(nowMs + 60_000).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };

  const useCase = createDiceCasinoUseCase({
    analytics: {
      getAchievementStats: () => emptyAchievementStats,
      recordRoundStarted: () => {},
      recordRoundCompleted: () => emptyAchievementStats,
    },
    contracts: {
      recordCasinoGameCompletion: () => ({
        updates: [],
        contractCompletionAnnouncements: [
          {
            userId: "casino-user",
            cadence: "daily",
            contractTitle: "High Stakes",
            rewardPips: 8,
          },
        ],
      }),
    },
    economy: {
      getPips: () => balance,
      applyPipsDelta: ({ amount }) => {
        balance += amount;
        return balance;
      },
      grantRewardPips: ({ baseAmount }) => {
        balance += baseAmount;
        return {
          awardedAmount: baseAmount,
          pips: balance,
        };
      },
    },
    progression: {
      awardAchievements: () => [],
    },
    sessions: {
      getActiveSession: () => activeSession,
      saveSession: (session) => {
        activeSession = session;
      },
      expireSession: () => {
        activeSession = null;
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase.handleDiceCasinoAction(
    "casino-user",
    {
      type: "exact-face",
      ownerId: "casino-user",
      face: 2,
      sessionToken: "session-1",
    },
    nowMs,
  );

  assert.deepEqual(result.contractCompletionAnnouncements, [
    {
      userId: "casino-user",
      cadence: "daily",
      contractTitle: "High Stakes",
      rewardPips: 8,
    },
  ]);
});

test("completed casino rounds still succeed when contract progress recording fails", () => {
  const nowMs = Date.UTC(2026, 2, 27, 12, 0, 0);
  let balance = 50;
  let activeSession: DiceCasinoSession | null = {
    userId: "casino-user",
    bet: 10,
    state: {
      ...createDefaultDiceCasinoSessionState("session-1"),
      currentScreen: "setup",
      selectedGame: "exact-roll",
      exactRollMode: "exact-face",
      exactRollFace: 2,
    },
    expiresAt: new Date(nowMs + 60_000).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };

  const useCase = createDiceCasinoUseCase({
    analytics: {
      getAchievementStats: () => emptyAchievementStats,
      recordRoundStarted: () => {},
      recordRoundCompleted: () => emptyAchievementStats,
    },
    contracts: {
      recordCasinoGameCompletion: () => {
        throw new Error("contracts unavailable");
      },
    },
    economy: {
      getPips: () => balance,
      applyPipsDelta: ({ amount }) => {
        balance += amount;
        return balance;
      },
      grantRewardPips: ({ baseAmount }) => {
        balance += baseAmount;
        return {
          awardedAmount: baseAmount,
          pips: balance,
        };
      },
    },
    progression: {
      awardAchievements: () => [],
    },
    sessions: {
      getActiveSession: () => activeSession,
      saveSession: (session) => {
        activeSession = session;
      },
      expireSession: () => {
        activeSession = null;
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase.handleDiceCasinoAction(
    "casino-user",
    {
      type: "exact-face",
      ownerId: "casino-user",
      face: 2,
      sessionToken: "session-1",
    },
    nowMs,
  );

  assert.equal(result.kind, "update");
});
