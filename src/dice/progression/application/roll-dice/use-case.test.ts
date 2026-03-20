import assert from "node:assert/strict";
import test from "node:test";
import { createRunRollDiceUseCase } from "./use-case";

test("roll dice unlocks Peak Goblin when roll pass count reaches 2", () => {
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

    assert.match(result.content, /Peak Goblin/);
  } finally {
    Math.random = originalRandom;
  }
});
