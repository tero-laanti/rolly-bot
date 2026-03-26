import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { DiceAnalytics } from "../../../analytics/domain/analytics";
import type { DicePvpChallenge, DicePvpEffects } from "../../domain/pvp";

const moduleRequire = createRequire(__filename);

const withCustomRollyData = <T>(run: (dataDir: string) => Promise<T>): Promise<T> => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rolly-pvp-data-"));
  fs.cpSync(path.join(process.cwd(), "example-data/rolly-data"), tempDir, { recursive: true });
  const achievementsPath = path.join(tempDir, "achievements.json");
  const achievements = JSON.parse(fs.readFileSync(achievementsPath, "utf8")) as Array<
    Record<string, unknown>
  >;
  achievements.push(
    {
      id: "pvp-first-win",
      name: "PvP First Win",
      description: "Win your first PvP duel.",
      category: "pvp",
      rule: { type: "manual" },
      unlockReasonText: "first PvP win",
      pipReward: 3,
    },
    {
      id: "pvp-first-loss",
      name: "PvP First Loss",
      description: "Lose your first PvP duel.",
      category: "pvp",
      rule: { type: "manual" },
      unlockReasonText: "first PvP loss",
      pipReward: 3,
    },
  );
  fs.writeFileSync(achievementsPath, JSON.stringify(achievements, null, 2));

  return Promise.resolve()
    .then(() => run(tempDir))
    .finally(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
};

const loadUseCase = (dataDir: string) => {
  const previous = process.env.ROLLY_DATA_DIR;
  process.env.ROLLY_DATA_DIR = dataDir;

  const loadModule = (modulePath: string) => {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
    return moduleRequire(modulePath);
  };

  try {
    loadModule("../../../../rolly-data/load");
    loadModule("../../../progression/domain/achievements");
    return loadModule("./use-case") as typeof import("./use-case");
  } finally {
    if (previous === undefined) {
      delete process.env.ROLLY_DATA_DIR;
    } else {
      process.env.ROLLY_DATA_DIR = previous;
    }
  }
};

test("resolved duels return announcement metadata for both players", async () => {
  await withCustomRollyData(async (dataDir) => {
    const { createDicePvpUseCase } = loadUseCase(dataDir);
    const balances = new Map<string, number>();
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

    const getAnalytics = (userId: string): DiceAnalytics =>
      analytics.get(userId) ?? {
        diceCountStartedAt: new Date(0).toISOString(),
        prestigeStartedAt: new Date(0).toISOString(),
        rollSetsCurrentDiceCount: 0,
        nearDiceCountIncreaseRollSetsCurrentDiceCount: 0,
        diceRolledCurrentPrestige: 0,
        totalDiceRolled: 0,
        totalDiceSetsRolled: 0,
        totalRollCommandsCalled: 0,
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
        getPips: (userId) => balances.get(userId) ?? 0,
        applyPipsDelta: ({ userId, amount }) => {
          const next = (balances.get(userId) ?? 0) + amount;
          balances.set(userId, next);
          return next;
        },
      },
      hostileEffects: {
        applyShieldableNegativeLockout: ({ userId, durationMs, nowMs = Date.now() }) => {
          const lockoutUntilMs = nowMs + durationMs;
          effects.set(userId, {
            lockoutUntil: new Date(lockoutUntilMs).toISOString(),
            doubleRollUntil: effects.get(userId)?.doubleRollUntil ?? null,
          });
          return {
            blockedByShield: false,
            applied: true,
            lockoutUntilMs,
          };
        },
      },
      inventory: {
        getInventoryQuantities: () => new Map(),
      },
      progression: {
        getDicePrestige: () => 0,
        awardAchievements: (_userId, achievementIds) => achievementIds,
      },
      pvp: {
        cancelLockedPendingDicePvpChallengesForUser: () => [],
        createDicePvpChallengeIfUsersAvailable: (challenge) => {
          challenges.set(challenge.id, {
            ...challenge,
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          return { created: true };
        },
        expireExpiredPendingDicePvpChallengesForUser: () => [],
        recordResolvedDuel: ({ userId, duelTier, result }) => {
          const current = getStats(userId);
          const nextCurrentWinStreak = result === "win" ? current.currentWinStreak + 1 : 0;
          const next = {
            duelsTotal: current.duelsTotal + 1,
            currentWinStreak: nextCurrentWinStreak,
            highestWinStreak: Math.max(current.highestWinStreak, nextCurrentWinStreak),
            highestTierWin:
              result === "win"
                ? Math.max(current.highestTierWin, duelTier)
                : current.highestTierWin,
          };
          achievementStats.set(userId, next);
          return next;
        },
        getActiveDiceLockout: () => null,
        getDicePvpAchievementStats: (userId) => getStats(userId),
        getDicePvpChallenge: (challengeId) => challenges.get(challengeId),
        getDicePvpEffects: (userId) =>
          effects.get(userId) ?? {
            lockoutUntil: null,
            doubleRollUntil: null,
          },
        setDicePvpChallengeOpponentFromOpen: () => false,
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
          const current = effects.get(userId) ?? { lockoutUntil: null, doubleRollUntil: null };
          effects.set(userId, {
            lockoutUntil: lockoutUntil === undefined ? current.lockoutUntil : lockoutUntil,
            doubleRollUntil:
              doubleRollUntil === undefined ? current.doubleRollUntil : doubleRollUntil,
          });
        },
      },
      random: (() => {
        const values = [0.8, 0.1];
        return () => values.shift() ?? 0;
      })(),
      unitOfWork: {
        runInTransaction: (work) => work(),
      },
    });

    const pickResult = await useCase.handleDicePvpAction(
      "challenger",
      {
        type: "pick",
        ownerId: "challenger",
        opponentId: "opponent",
        duelTier: 1,
        wagerPips: 0,
      },
      async () => ({ url: "https://example.test/challenge" }),
      1_710_000_000_000,
    );

    assert.equal(pickResult.kind, "update");
    const challenge = [...challenges.values()][0];
    if (!challenge) {
      throw new Error("Expected challenge to be created.");
    }

    const result = await useCase.handleDicePvpAction(
      "opponent",
      {
        type: "accept",
        challengeId: challenge.id,
      },
      null,
      1_710_000_000_000,
    );

    assert.deepEqual(result.achievementAnnouncements, [
      {
        userId: "challenger",
        achievementIds: ["pvp-first-win"],
      },
      {
        userId: "opponent",
        achievementIds: ["pvp-first-loss"],
      },
    ]);
    assert.equal(result.payload.type, "message");
    if (result.payload.type !== "message") {
      return;
    }

    assert.match(result.payload.content, /Duel complete\./);
    assert.doesNotMatch(result.payload.content, /Achievement unlocked/i);
  });
});
