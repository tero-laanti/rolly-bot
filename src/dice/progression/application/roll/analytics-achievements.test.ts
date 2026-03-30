import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const moduleRequire = createRequire(__filename);

const loadModule = <T>(modulePath: string): T => {
  const resolved = moduleRequire.resolve(modulePath);
  delete require.cache[resolved];
  return moduleRequire(modulePath) as T;
};

const withExampleRollyData = async <T>(run: () => Promise<T>): Promise<T> => {
  const previous = process.env.ROLLY_DATA_DIR;
  process.env.ROLLY_DATA_DIR = `${process.cwd()}/example-data/rolly-data`;

  try {
    loadModule("../../../../rolly-data/load");
    loadModule("../../domain/achievements");
    loadModule("./use-case");
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.ROLLY_DATA_DIR;
    } else {
      process.env.ROLLY_DATA_DIR = previous;
    }
  }
};

test("roll use case unlocks analytics milestone achievements from updated stats counters", async () => {
  await withExampleRollyData(async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const { createRunRollDiceUseCase } = loadModule<typeof import("./use-case")>("./use-case");

      const useCase = createRunRollDiceUseCase({
        analytics: {
          getDiceAnalytics: () => ({
            diceCountStartedAt: "2026-03-30T00:00:00.000Z",
            prestigeStartedAt: "2026-03-30T00:00:00.000Z",
            rollSetsCurrentDiceCount: 5,
            nearDiceCountIncreaseRollSetsCurrentDiceCount: 0,
            diceRolledCurrentPrestige: 5,
            totalDiceRolled: 5,
            totalDiceSetsRolled: 5,
            totalRollCommandsCalled: 5,
            pvpWins: 0,
            pvpLosses: 0,
            pvpDraws: 0,
          }),
          recordDiceRollAnalytics: () => {},
          resetDiceCountAnalyticsProgress: () => {},
        },
        economy: {
          applyFameDelta: ({ amount }) => amount,
          getFame: () => 0,
          grantDailyPipsIfEligible: () => ({
            awarded: false,
            awardedAmount: 0,
            pips: 0,
            lastDailyPipRewardAt: null,
          }),
        },
        itemEffects: {
          consumeOneDoubleRollUse: () => false,
          getItemDoubleRollStatus: () => ({
            isActive: false,
            remainingUses: 0,
            expiresAtMs: null,
          }),
        },
        permanentBonuses: {
          getPermanentBonuses: () => ({
            extraBanSlots: 0,
            pipRewardBonusPercent: 0,
            personalCharge: {
              unlocked: false,
              minutesPerMultiplier: 0,
              speedMultiplier: 1,
              maxMultiplier: 1,
            },
          }),
        },
        progression: {
          awardAchievements: (_userId: string, achievementIds: string[]) => achievementIds,
          consumeDiceTemporaryEffectsForRoll: () => 0,
          recordDiceProgressionAchievementStats: () => ({
            rollCommandsTotal: 0,
            nearDiceCountIncreaseRollsTotal: 0,
            highestChargeMultiplier: 1,
            highestRollPassCount: 1,
            diceCountIncreasesTotal: 0,
            firstBanAt: null,
          }),
          getActiveDiceTemporaryEffects: () => [],
          getDiceBans: () => new Map<number, Set<number>>(),
          getDiceCount: () => 1,
          getDicePrestige: () => 0,
          getDiceSides: () => 6,
          getLastDiceRollAt: () => null,
          getLastPersonalDiceRollAt: () => null,
          getUserDiceAchievements: () => [],
          setDiceCount: () => {},
          setLastDiceRollAt: () => {},
          setLastPersonalDiceRollAt: () => {},
        },
        pvp: {
          getActiveDiceLockout: () => null,
          getActiveDoubleRoll: () => null,
        },
        unitOfWork: {
          runInTransaction: (work) => work(),
        },
      });

      const result = useCase({
        userId: "user-analytics",
        userMention: "<@user-analytics>",
        source: "manual",
        nowMs: 1_710_000_000_000,
      });

      assert.deepEqual(result.achievementAnnouncements, [
        {
          userId: "user-analytics",
          achievementIds: ["example-beginner-roller"],
        },
      ]);
    } finally {
      Math.random = originalRandom;
    }
  });
});
