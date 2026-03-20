import assert from "node:assert/strict";
import test from "node:test";
import type { DiceAnalytics } from "../../../analytics/domain/analytics";
import type { DicePvpChallenge, DicePvpEffects } from "../../domain/pvp";
import { createDicePvpUseCase } from "./use-case";

type Harness = ReturnType<typeof createHarness>;

const createHarness = ({
  pips = {},
  randomValues = [0],
}: {
  pips?: Record<string, number>;
  randomValues?: number[];
} = {}) => {
  const balances = new Map<string, number>(Object.entries(pips));
  const challenges = new Map<string, DicePvpChallenge>();
  const effects = new Map<string, DicePvpEffects>();
  const analytics = new Map<string, DiceAnalytics>();
  const achievementStats = new Map<
    string,
    {
      duelsTotal: number;
      currentWinStreak: number;
      highestWinStreak: number;
      highestTierWin: number;
    }
  >();
  const randomQueue = [...randomValues];

  const getBalance = (userId: string) => balances.get(userId) ?? 0;
  const setBalance = (userId: string, amount: number) => {
    balances.set(userId, amount);
  };
  const getEffects = (userId: string): DicePvpEffects =>
    effects.get(userId) ?? { lockoutUntil: null, doubleRollUntil: null };
  const getAnalytics = (userId: string): DiceAnalytics =>
    analytics.get(userId) ?? {
      levelStartedAt: new Date(0).toISOString(),
      prestigeStartedAt: new Date(0).toISOString(),
      rollsCurrentLevel: 0,
      nearLevelupRollsCurrentLevel: 0,
      diceRolledCurrentPrestige: 0,
      totalDiceRolled: 0,
      pvpWins: 0,
      pvpLosses: 0,
      pvpDraws: 0,
    };
  const getStats = (userId: string) =>
    achievementStats.get(userId) ?? {
      duelsTotal: 0,
      currentWinStreak: 0,
      highestWinStreak: 0,
      highestTierWin: 0,
    };

  const useCase = createDicePvpUseCase({
    analytics: {
      getDiceAnalytics: (userId) => getAnalytics(userId),
      updateDicePvpStats: ({ userId, wins = 0, losses = 0, draws = 0 }) => {
        const current = getAnalytics(userId);
        analytics.set(userId, {
          ...current,
          pvpWins: current.pvpWins + wins,
          pvpLosses: current.pvpLosses + losses,
          pvpDraws: current.pvpDraws + draws,
        });
      },
    },
    economy: {
      getPips: (userId) => getBalance(userId),
      applyPipsDelta: ({ userId, amount }) => {
        const next = getBalance(userId) + amount;
        setBalance(userId, next);
        return next;
      },
    },
    hostileEffects: {
      applyShieldableNegativeLockout: ({ userId, durationMs, nowMs = Date.now() }) => {
        const lockoutUntil = new Date(nowMs + durationMs).toISOString();
        effects.set(userId, {
          ...getEffects(userId),
          lockoutUntil,
        });
        return {
          blockedByShield: false,
          lockoutUntilMs: Date.parse(lockoutUntil),
        };
      },
    },
    progression: {
      getDicePrestige: () => 0,
      awardAchievements: () => [],
    },
    pvp: {
      createDicePvpChallengeIfUsersAvailable: (challenge) => {
        challenges.set(challenge.id, {
          ...challenge,
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return { created: true };
      },
      recordResolvedDuel: ({ userId, duelTier, result }) => {
        const current = getStats(userId);
        const nextCurrentWinStreak = result === "win" ? current.currentWinStreak + 1 : 0;
        const next = {
          duelsTotal: current.duelsTotal + 1,
          currentWinStreak: nextCurrentWinStreak,
          highestWinStreak: Math.max(current.highestWinStreak, nextCurrentWinStreak),
          highestTierWin:
            result === "win" ? Math.max(current.highestTierWin, duelTier) : current.highestTierWin,
        };
        achievementStats.set(userId, next);
        return next;
      },
      getActiveDiceLockout: (userId, nowMs = Date.now()) => {
        const lockoutUntil = getEffects(userId).lockoutUntil;
        if (!lockoutUntil) {
          return null;
        }

        const parsed = Date.parse(lockoutUntil);
        return Number.isNaN(parsed) || parsed <= nowMs ? null : parsed;
      },
      getDicePvpAchievementStats: (userId) => getStats(userId),
      getDicePvpChallenge: (challengeId) => challenges.get(challengeId),
      getDicePvpEffects: (userId) => getEffects(userId),
      setDicePvpChallengeOpponentFromOpen: (challengeId, opponentId) => {
        const current = challenges.get(challengeId);
        if (!current || current.status !== "pending" || current.opponentId !== "__open__") {
          return false;
        }

        challenges.set(challengeId, {
          ...current,
          opponentId,
          updatedAt: new Date().toISOString(),
        });
        return true;
      },
      setDicePvpChallengeStatusFromPending: (challengeId, status) => {
        const current = challenges.get(challengeId);
        if (!current || current.status !== "pending") {
          return false;
        }

        challenges.set(challengeId, {
          ...current,
          status,
          updatedAt: new Date().toISOString(),
        });
        return true;
      },
      setDicePvpEffects: ({ userId, lockoutUntil, doubleRollUntil }) => {
        const current = getEffects(userId);
        effects.set(userId, {
          lockoutUntil: lockoutUntil === undefined ? current.lockoutUntil : lockoutUntil,
          doubleRollUntil:
            doubleRollUntil === undefined ? current.doubleRollUntil : doubleRollUntil,
        });
      },
    },
    random: () => randomQueue.shift() ?? 0,
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  return {
    balances,
    challenges,
    useCase,
  };
};

const createChallenge = async ({
  harness,
  ownerId = "challenger",
  opponentId = "opponent",
  wagerPips,
  publishChallenge = async () => ({ url: "https://example.test/challenge" }),
  nowMs = Date.now(),
}: {
  harness: Harness;
  ownerId?: string;
  opponentId?: string | null;
  wagerPips: number;
  publishChallenge?: (view: unknown) => Promise<{ url: string }>;
  nowMs?: number;
}) => {
  await harness.useCase.handleDicePvpAction(
    ownerId,
    {
      type: "pick",
      ownerId,
      opponentId,
      duelTier: 1,
      wagerPips,
    },
    publishChallenge,
    nowMs,
  );

  const [challenge] = harness.challenges.values();
  if (!challenge) {
    throw new Error("Expected a challenge to be created.");
  }

  return challenge;
};

test("creating a wagered challenge escrows the challenger stake", async () => {
  const harness = createHarness({
    pips: { challenger: 20, opponent: 20 },
  });

  const challenge = await createChallenge({
    harness,
    wagerPips: 7,
  });

  assert.equal(challenge.wagerPips, 7);
  assert.equal(harness.balances.get("challenger"), 13);
  assert.equal(challenge.status, "pending");
});

test("declining a wagered challenge refunds the challenger", async () => {
  const harness = createHarness({
    pips: { challenger: 20, opponent: 20 },
  });
  const challenge = await createChallenge({
    harness,
    wagerPips: 5,
  });

  const result = await harness.useCase.handleDicePvpAction(
    "opponent",
    { type: "decline", challengeId: challenge.id },
    null,
  );

  assert.equal(harness.balances.get("challenger"), 20);
  assert.equal(harness.challenges.get(challenge.id)?.status, "declined");
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /refunded 5 pips/);
});

test("expired challenges refund the challenger stake", async () => {
  const harness = createHarness({
    pips: { challenger: 20, opponent: 20 },
  });
  const createdAt = Date.UTC(2026, 0, 1, 12, 0, 0);
  const challenge = await createChallenge({
    harness,
    wagerPips: 6,
    nowMs: createdAt,
  });

  const result = await harness.useCase.handleDicePvpAction(
    "opponent",
    { type: "accept", challengeId: challenge.id },
    null,
    createdAt + 10 * 60 * 1000,
  );

  assert.equal(harness.balances.get("challenger"), 20);
  assert.equal(harness.challenges.get(challenge.id)?.status, "expired");
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /refunded 6 pips/);
});

test("accept rejects players who cannot cover the wager and keeps the challenge pending", async () => {
  const harness = createHarness({
    pips: { challenger: 20, opponent: 4 },
  });
  const challenge = await createChallenge({
    harness,
    wagerPips: 8,
  });

  const result = await harness.useCase.handleDicePvpAction(
    "opponent",
    { type: "accept", challengeId: challenge.id },
    null,
  );

  assert.equal(harness.balances.get("challenger"), 12);
  assert.equal(harness.balances.get("opponent"), 4);
  assert.equal(harness.challenges.get(challenge.id)?.status, "pending");
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /needs 8 pips/);
});

test("draws refund both wager stakes in full", async () => {
  const harness = createHarness({
    pips: { challenger: 20, opponent: 20 },
    randomValues: [0, 0],
  });
  const challenge = await createChallenge({
    harness,
    wagerPips: 10,
  });

  const result = await harness.useCase.handleDicePvpAction(
    "opponent",
    { type: "accept", challengeId: challenge.id },
    null,
  );

  assert.equal(harness.balances.get("challenger"), 20);
  assert.equal(harness.balances.get("opponent"), 20);
  assert.equal(harness.challenges.get(challenge.id)?.status, "resolved");
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /Draw refund: both players get 10 pips back/);
});

test("decisive wager payouts apply the minimum and maximum burn caps", async () => {
  for (const scenario of [
    {
      wagerPips: 1,
      startingPips: 10,
      expectedWinnerPips: 10,
      expectedLoserPips: 9,
      burnText: /1 pip burned/,
      payoutText: /receives 1 pip/,
    },
    {
      wagerPips: 100,
      startingPips: 200,
      expectedWinnerPips: 295,
      expectedLoserPips: 100,
      burnText: /5 pips burned/,
      payoutText: /receives 195 pips/,
    },
  ]) {
    const harness = createHarness({
      pips: { challenger: scenario.startingPips, opponent: scenario.startingPips },
      randomValues: [0.9, 0],
    });
    const challenge = await createChallenge({
      harness,
      wagerPips: scenario.wagerPips,
    });

    const result = await harness.useCase.handleDicePvpAction(
      "opponent",
      { type: "accept", challengeId: challenge.id },
      null,
    );

    assert.equal(harness.balances.get("challenger"), scenario.expectedWinnerPips);
    assert.equal(harness.balances.get("opponent"), scenario.expectedLoserPips);
    assert.equal(result.payload.type, "message");
    assert.match(result.payload.content, scenario.payoutText);
    assert.match(result.payload.content, scenario.burnText);
  }
});

test("failed challenge publishing cancels the challenge and refunds the challenger", async () => {
  const harness = createHarness({
    pips: { challenger: 20, opponent: 20 },
  });

  const result = await harness.useCase.handleDicePvpAction(
    "challenger",
    {
      type: "pick",
      ownerId: "challenger",
      opponentId: "opponent",
      duelTier: 1,
      wagerPips: 9,
    },
    async () => {
      throw new Error("publish failed");
    },
  );

  const [challenge] = harness.challenges.values();
  assert.equal(challenge?.status, "cancelled");
  assert.equal(harness.balances.get("challenger"), 20);
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /refunded 9 pips/);
});
