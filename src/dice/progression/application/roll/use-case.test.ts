import assert from "node:assert/strict";
import test from "node:test";
import { getAchievementPipRewardTotal } from "../../domain/achievements-store";
import { getFirstDailyRollPipReward } from "../../domain/game-rules";
import { createRunRollDiceUseCase } from "./use-case";

const firstDailyRollPipReward = getFirstDailyRollPipReward();

test("roll dice unlocks peak-goblin when roll pass count reaches 2", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
        recordDiceRollAnalytics: () => {},
        resetDiceLevelAnalyticsProgress: () => {},
      },
      economy: {
        applyFameDelta: ({ amount }) => amount,
        getFame: () => 0,
        grantDailyPipsIfEligible: () => ({
          awarded: false,
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
      progression: {
        awardAchievements: (_userId, achievementIds) => achievementIds,
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearLevelupRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 2,
          levelUpsTotal: 1,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceLevel: () => 1,
        getDicePrestige: () => 1,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => Date.now(),
        getUserDiceAchievements: () => [],
        setDiceLevel: () => {},
        setLastDiceRollAt: () => {},
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
      userId: "user-1",
      userMention: "<@user-1>",
      nowMs: 1_710_000_000_000,
    });

    assert.equal(result.content.includes("peak-goblin"), true);
  } finally {
    Math.random = originalRandom;
  }
});

test("first roll of the UTC day awards daily pips", () => {
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceLevelAnalyticsProgress: () => {},
    },
    economy: {
      applyFameDelta: ({ amount }) => amount,
      getFame: () => 0,
      grantDailyPipsIfEligible: () => ({
        awarded: true,
        pips: firstDailyRollPipReward,
        lastDailyPipRewardAt: "2026-03-20T09:00:00.000Z",
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
    progression: {
      awardAchievements: () => [],
      consumeDiceTemporaryEffectsForRoll: () => 0,
      recordDiceProgressionAchievementStats: () => ({
        rollCommandsTotal: 1,
        nearLevelupRollsTotal: 0,
        highestChargeMultiplier: 1,
        highestRollPassCount: 1,
        levelUpsTotal: 0,
        firstBanAt: null,
      }),
      getActiveDiceTemporaryEffects: () => [],
      getDiceBans: () => new Map(),
      getDiceLevel: () => 1,
      getDicePrestige: () => 0,
      getDiceSides: () => 6,
      getLastDiceRollAt: () => null,
      getUserDiceAchievements: () => [],
      setDiceLevel: () => {},
      setLastDiceRollAt: () => {},
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
    userId: "user-2",
    userMention: "<@user-2>",
    nowMs: 1_710_000_000_000,
  });

  assert.match(result.content, new RegExp(`${firstDailyRollPipReward} Pips`));
});

test("blocked rolls do not consume or grant the daily pip reward", () => {
  let dailyGrantCalled = false;
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceLevelAnalyticsProgress: () => {},
    },
    economy: {
      applyFameDelta: ({ amount }) => amount,
      getFame: () => 0,
      grantDailyPipsIfEligible: () => {
        dailyGrantCalled = true;
        return {
          awarded: true,
          pips: firstDailyRollPipReward,
          lastDailyPipRewardAt: "2026-03-20T09:00:00.000Z",
        };
      },
    },
    itemEffects: {
      consumeOneDoubleRollUse: () => false,
      getItemDoubleRollStatus: () => ({
        isActive: false,
        remainingUses: 0,
        expiresAtMs: null,
      }),
    },
    progression: {
      awardAchievements: () => [],
      consumeDiceTemporaryEffectsForRoll: () => 0,
      recordDiceProgressionAchievementStats: () => ({
        rollCommandsTotal: 0,
        nearLevelupRollsTotal: 0,
        highestChargeMultiplier: 1,
        highestRollPassCount: 1,
        levelUpsTotal: 0,
        firstBanAt: null,
      }),
      getActiveDiceTemporaryEffects: () => [],
      getDiceBans: () => new Map(),
      getDiceLevel: () => 1,
      getDicePrestige: () => 0,
      getDiceSides: () => 6,
      getLastDiceRollAt: () => null,
      getUserDiceAchievements: () => [],
      setDiceLevel: () => {},
      setLastDiceRollAt: () => {},
    },
    pvp: {
      getActiveDiceLockout: () => 1_710_000_060_000,
      getActiveDoubleRoll: () => null,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase({
    userId: "user-3",
    userMention: "<@user-3>",
    nowMs: 1_710_000_000_000,
  });

  assert.equal(dailyGrantCalled, false);
  assert.match(result.content, /you can play again/i);
});

test("auto rolls do not grant the daily pip reward", () => {
  let dailyGrantCalled = false;
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceLevelAnalyticsProgress: () => {},
    },
    economy: {
      applyFameDelta: ({ amount }) => amount,
      getFame: () => 0,
      grantDailyPipsIfEligible: () => {
        dailyGrantCalled = true;
        return {
          awarded: true,
          pips: 5,
          lastDailyPipRewardAt: "2026-03-20T09:00:00.000Z",
        };
      },
    },
    itemEffects: {
      consumeOneDoubleRollUse: () => false,
      getItemDoubleRollStatus: () => ({
        isActive: false,
        remainingUses: 0,
        expiresAtMs: null,
      }),
    },
    progression: {
      awardAchievements: () => [],
      consumeDiceTemporaryEffectsForRoll: () => 0,
      recordDiceProgressionAchievementStats: () => ({
        rollCommandsTotal: 1,
        nearLevelupRollsTotal: 0,
        highestChargeMultiplier: 1,
        highestRollPassCount: 1,
        levelUpsTotal: 0,
        firstBanAt: null,
      }),
      getActiveDiceTemporaryEffects: () => [],
      getDiceBans: () => new Map(),
      getDiceLevel: () => 1,
      getDicePrestige: () => 0,
      getDiceSides: () => 6,
      getLastDiceRollAt: () => null,
      getUserDiceAchievements: () => [],
      setDiceLevel: () => {},
      setLastDiceRollAt: () => {},
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
    userId: "user-5",
    userMention: "<@user-5>",
    source: "auto",
    nowMs: 1_710_000_000_000,
  });

  assert.equal(dailyGrantCalled, false);
  assert.doesNotMatch(result.content, /5 Pips/);
});

test("reward text includes both fame and pip rewards when both are earned", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  const achievementPipReward =
    getAchievementPipRewardTotal(["first-roll", "first-level-up"]) + firstDailyRollPipReward;

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
        recordDiceRollAnalytics: () => {},
        resetDiceLevelAnalyticsProgress: () => {},
      },
      economy: {
        applyFameDelta: ({ amount }) => amount,
        getFame: () => 0,
        grantDailyPipsIfEligible: () => ({
          awarded: true,
          pips: firstDailyRollPipReward,
          lastDailyPipRewardAt: "2026-03-20T09:00:00.000Z",
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
      progression: {
        awardAchievements: (_userId, achievementIds) => achievementIds,
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearLevelupRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 1,
          levelUpsTotal: 1,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceLevel: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceLevel: () => {},
        setLastDiceRollAt: () => {},
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
      userId: "user-4",
      userMention: "<@user-4>",
      nowMs: 1_710_000_000_000,
    });

    assert.match(
      result.content,
      new RegExp(`You receive 3 Fame and ${achievementPipReward} Pips and a new die\\.`),
    );
  } finally {
    Math.random = originalRandom;
  }
});
