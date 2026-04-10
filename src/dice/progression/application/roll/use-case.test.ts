import assert from "node:assert/strict";
import test from "node:test";
import { getAchievementPipRewardTotal } from "../../domain/achievements-store";
import {
  getDiceBanStep,
  getDiceChargeStartMs,
  getFirstDailyRollPipReward,
} from "../../domain/game-rules";
import { minuteMs } from "../../../../shared/time";
import { createRunRollDiceUseCase } from "./use-case";

const firstDailyRollPipReward = getFirstDailyRollPipReward();

const zeroPermanentBonuses = {
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
};

const createProgressionStub = () => ({
  awardAchievements: (_userId: string, achievementIds: string[]) => achievementIds,
  consumeDiceTemporaryEffectsForRoll: () => 0,
  recordDiceProgressionAchievementStats: () => ({
    rollCommandsTotal: 1,
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
});

test("roll dice unlocks peak-goblin when roll pass count reaches 2", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: (_userId, achievementIds) => achievementIds,
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 2,
          diceCountIncreasesTotal: 1,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 1,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => Date.now(),
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
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

    assert.equal(result.content.includes("peak-goblin"), false);
    assert.deepEqual(result.achievementAnnouncements, [
      {
        userId: "user-1",
        achievementIds: ["first-roll", "first-extra-die", "peak-goblin"],
      },
    ]);
  } finally {
    Math.random = originalRandom;
  }
});

test("first roll of the UTC day awards daily pips", () => {
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    economy: {
      applyFameDelta: ({ amount }) => amount,
      getFame: () => 0,
      grantDailyPipsIfEligible: () => ({
        awarded: true,
        awardedAmount: firstDailyRollPipReward,
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
    permanentBonuses: zeroPermanentBonuses,
    progression: {
      ...createProgressionStub(),
      awardAchievements: () => [],
      consumeDiceTemporaryEffectsForRoll: () => 0,
      recordDiceProgressionAchievementStats: () => ({
        rollCommandsTotal: 1,
        nearDiceCountIncreaseRollsTotal: 0,
        highestChargeMultiplier: 1,
        highestRollPassCount: 1,
        diceCountIncreasesTotal: 0,
        firstBanAt: null,
      }),
      getActiveDiceTemporaryEffects: () => [],
      getDiceBans: () => new Map(),
      getDiceCount: () => 1,
      getDicePrestige: () => 0,
      getDiceSides: () => 6,
      getLastDiceRollAt: () => null,
      getUserDiceAchievements: () => [],
      setDiceCount: () => {},
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

  assert.match(result.content, /\*\*Daily first roll bonus!\*\*/);
  assert.match(result.content, new RegExp(`${firstDailyRollPipReward} Pips`));
});

test("first unlocked ban slot tells the user to use /bans without the generic unlock text", () => {
  const banStep = getDiceBanStep();
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    economy: {
      applyFameDelta: () => banStep,
      getFame: () => banStep - 1,
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
    permanentBonuses: zeroPermanentBonuses,
    progression: {
      ...createProgressionStub(),
      awardAchievements: () => [],
      consumeDiceTemporaryEffectsForRoll: () => 0,
      recordDiceProgressionAchievementStats: () => ({
        rollCommandsTotal: 5,
        nearDiceCountIncreaseRollsTotal: 0,
        highestChargeMultiplier: 1,
        highestRollPassCount: 1,
        diceCountIncreasesTotal: 0,
        firstBanAt: null,
      }),
      getActiveDiceTemporaryEffects: () => [],
      getDiceBans: () => new Map(),
      getDiceCount: () => 1,
      getDicePrestige: () => 0,
      getDiceSides: () => 6,
      getLastDiceRollAt: () => null,
      getUserDiceAchievements: () => ["first-roll"],
      setDiceCount: () => {},
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
    userId: "user-ban-first",
    userMention: "<@user-ban-first>",
    nowMs: 1_710_000_000_000,
  });

  assert.match(
    result.content,
    /You unlocked your first ban slot\. Use \/bans to customize your roll pool\./,
  );
  assert.doesNotMatch(result.content, /\| New ban slot unlocked\./);
});

test("later unlocked ban slots keep the generic unlock text", () => {
  const banStep = getDiceBanStep();
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    economy: {
      applyFameDelta: () => banStep * 2,
      getFame: () => banStep * 2 - 1,
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
    permanentBonuses: zeroPermanentBonuses,
    progression: {
      ...createProgressionStub(),
      awardAchievements: () => [],
      consumeDiceTemporaryEffectsForRoll: () => 0,
      recordDiceProgressionAchievementStats: () => ({
        rollCommandsTotal: 8,
        nearDiceCountIncreaseRollsTotal: 0,
        highestChargeMultiplier: 1,
        highestRollPassCount: 1,
        diceCountIncreasesTotal: 0,
        firstBanAt: null,
      }),
      getActiveDiceTemporaryEffects: () => [],
      getDiceBans: () => new Map(),
      getDiceCount: () => 1,
      getDicePrestige: () => 0,
      getDiceSides: () => 6,
      getLastDiceRollAt: () => null,
      getUserDiceAchievements: () => ["first-roll"],
      setDiceCount: () => {},
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
    userId: "user-ban-later",
    userMention: "<@user-ban-later>",
    nowMs: 1_710_000_000_000,
  });

  assert.match(result.content, /New ban slot unlocked\./);
  assert.doesNotMatch(result.content, /Use \/bans to customize your roll pool\./);
});

test("blocked rolls do not consume or grant the daily pip reward", () => {
  let dailyGrantCalled = false;
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    economy: {
      applyFameDelta: ({ amount }) => amount,
      getFame: () => 0,
      grantDailyPipsIfEligible: () => {
        dailyGrantCalled = true;
        return {
          awarded: true,
          awardedAmount: firstDailyRollPipReward,
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
    permanentBonuses: zeroPermanentBonuses,
    progression: {
      ...createProgressionStub(),
      awardAchievements: () => [],
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
      getDiceBans: () => new Map(),
      getDiceCount: () => 1,
      getDicePrestige: () => 0,
      getDiceSides: () => 6,
      getLastDiceRollAt: () => null,
      getUserDiceAchievements: () => [],
      setDiceCount: () => {},
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

test("manual rolls record roll_count contract progress", () => {
  const recordedEvents: Array<{ userId: string; occurredAt: Date }> = [];
  const nowMs = 1_710_000_000_000;
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    contracts: {
      recordRoll: (event) => {
        recordedEvents.push(event);
        return null;
      },
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
    permanentBonuses: zeroPermanentBonuses,
    progression: createProgressionStub(),
    pvp: {
      getActiveDiceLockout: () => null,
      getActiveDoubleRoll: () => null,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  useCase({
    userId: "contracts-roll-user",
    userMention: "<@contracts-roll-user>",
    nowMs,
  });

  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0]?.userId, "contracts-roll-user");
  assert.equal(recordedEvents[0]?.occurredAt.getTime(), nowMs);
});

test("manual rolls surface contract completion announcements", () => {
  const userId = "contracts-roll-announce-user";
  const nowMs = 1_710_000_100_000;
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    contracts: {
      recordRoll: () => ({
        updates: [],
        contractCompletionAnnouncements: [
          {
            userId,
            cadence: "daily",
            contractTitle: "Roll Routine",
            rewardPips: 12,
          },
        ],
      }),
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
    permanentBonuses: zeroPermanentBonuses,
    progression: createProgressionStub(),
    pvp: {
      getActiveDiceLockout: () => null,
      getActiveDoubleRoll: () => null,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase({
    userId,
    userMention: `<@${userId}>`,
    nowMs,
  });

  assert.deepEqual(result.contractCompletionAnnouncements, [
    {
      userId,
      cadence: "daily",
      contractTitle: "Roll Routine",
      rewardPips: 12,
    },
  ]);
});

test("manual rolls still succeed when contract progress recording fails", () => {
  const nowMs = 1_710_000_000_000;
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    contracts: {
      recordRoll: () => {
        throw new Error("contracts unavailable");
      },
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
    permanentBonuses: zeroPermanentBonuses,
    progression: createProgressionStub(),
    pvp: {
      getActiveDiceLockout: () => null,
      getActiveDoubleRoll: () => null,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase({
    userId: "resilient-roll-user",
    userMention: "<@resilient-roll-user>",
    nowMs,
  });

  assert.equal(result.ephemeral, false);
  assert.match(result.content, /rolled/i);
});

test("auto rolls do not record roll_count contract progress", () => {
  const recordedEvents: Array<{ userId: string; occurredAt: Date }> = [];
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    contracts: {
      recordRoll: (event) => {
        recordedEvents.push(event);
        return null;
      },
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
    permanentBonuses: zeroPermanentBonuses,
    progression: createProgressionStub(),
    pvp: {
      getActiveDiceLockout: () => null,
      getActiveDoubleRoll: () => null,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  useCase({
    userId: "contracts-auto-roll-user",
    userMention: "<@contracts-auto-roll-user>",
    source: "auto",
    nowMs: 1_710_000_000_001,
  });

  assert.equal(recordedEvents.length, 0);
});

test("auto rolls do not grant the daily pip reward", () => {
  let dailyGrantCalled = false;
  const useCase = createRunRollDiceUseCase({
    analytics: {
      recordDiceRollAnalytics: () => {},
      resetDiceCountAnalyticsProgress: () => {},
    },
    economy: {
      applyFameDelta: ({ amount }) => amount,
      getFame: () => 0,
      grantDailyPipsIfEligible: () => {
        dailyGrantCalled = true;
        return {
          awarded: true,
          awardedAmount: 5,
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
    permanentBonuses: zeroPermanentBonuses,
    progression: {
      ...createProgressionStub(),
      awardAchievements: () => [],
      consumeDiceTemporaryEffectsForRoll: () => 0,
      recordDiceProgressionAchievementStats: () => ({
        rollCommandsTotal: 1,
        nearDiceCountIncreaseRollsTotal: 0,
        highestChargeMultiplier: 1,
        highestRollPassCount: 1,
        diceCountIncreasesTotal: 0,
        firstBanAt: null,
      }),
      getActiveDiceTemporaryEffects: () => [],
      getDiceBans: () => new Map(),
      getDiceCount: () => 1,
      getDicePrestige: () => 0,
      getDiceSides: () => 6,
      getLastDiceRollAt: () => null,
      getUserDiceAchievements: () => [],
      setDiceCount: () => {},
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
  assert.doesNotMatch(result.content, /Daily first roll bonus!/);
  assert.doesNotMatch(result.content, /5 Pips/);
});

test("reward text includes both fame and pip rewards when both are earned", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  const achievementPipReward =
    getAchievementPipRewardTotal(["first-roll", "first-extra-die"]) + firstDailyRollPipReward;

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
        recordDiceRollAnalytics: () => {},
        resetDiceCountAnalyticsProgress: () => {},
      },
      economy: {
        applyFameDelta: ({ amount }) => amount,
        getFame: () => 0,
        grantDailyPipsIfEligible: () => ({
          awarded: true,
          awardedAmount: firstDailyRollPipReward,
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: (_userId, achievementIds) => achievementIds,
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 1,
          diceCountIncreasesTotal: 1,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
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

test("world boss damage uses the highest roll set total instead of summing all roll sets", () => {
  const originalRandom = Math.random;
  const randomValues = [0, 0.8, 0.5, 0.5];
  let randomIndex = 0;
  let appliedWorldBossDamage = 0;
  let appliedBestRollSet: readonly number[] | null | undefined;
  Math.random = () => {
    const value = randomValues[randomIndex] ?? 0;
    randomIndex += 1;
    return value;
  };

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 2,
          diceCountIncreasesTotal: 0,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 2,
        getDicePrestige: () => 1,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
        setLastDiceRollAt: () => {},
      },
      pvp: {
        getActiveDiceLockout: () => null,
        getActiveDoubleRoll: () => null,
      },
      worldBoss: {
        applyDiceRoll: ({
          damage,
          bestRollSet,
        }: {
          damage: number;
          bestRollSet?: readonly number[] | null;
        }) => {
          appliedWorldBossDamage = damage;
          appliedBestRollSet = bestRollSet;
          return {
            kind: "applied",
            summary: `World Boss damage: ${damage}`,
            defeated: false,
          };
        },
      },
      unitOfWork: {
        runInTransaction: (work) => work(),
      },
    });

    const result = useCase({
      userId: "user-6",
      userMention: "<@user-6>",
      channelId: "world-boss-thread-1",
      nowMs: 1_710_000_000_000,
    });

    assert.equal(appliedWorldBossDamage, 8);
    assert.deepEqual(appliedBestRollSet, [4, 4]);
    assert.match(result.content, /World Boss damage: 8/);
  } finally {
    Math.random = originalRandom;
  }
});

test("raid damage uses the highest roll set total when no World Boss is active", () => {
  const originalRandom = Math.random;
  const randomValues = [0, 0.8, 0.5, 0.5];
  let randomIndex = 0;
  let appliedRaidDamage = 0;
  let appliedBestRollSet: readonly number[] | null | undefined;
  Math.random = () => {
    const value = randomValues[randomIndex] ?? 0;
    randomIndex += 1;
    return value;
  };

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 2,
          diceCountIncreasesTotal: 0,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 2,
        getDicePrestige: () => 1,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
        setLastDiceRollAt: () => {},
      },
      pvp: {
        getActiveDiceLockout: () => null,
        getActiveDoubleRoll: () => null,
      },
      worldBoss: {
        applyDiceRoll: () => ({
          kind: "no-world-boss",
        }),
      },
      raid: {
        applyDiceRoll: ({
          damage,
          bestRollSet,
        }: {
          damage: number;
          bestRollSet?: readonly number[] | null;
        }) => {
          appliedRaidDamage = damage;
          appliedBestRollSet = bestRollSet;
          return {
            kind: "applied",
            summary: `Raid damage: ${damage}`,
            defeated: false,
          };
        },
      },
      unitOfWork: {
        runInTransaction: (work) => work(),
      },
    });

    const result = useCase({
      userId: "user-7",
      userMention: "<@user-7>",
      channelId: "raid-channel-1",
      nowMs: 1_710_000_000_000,
    });

    assert.equal(appliedRaidDamage, 8);
    assert.deepEqual(appliedBestRollSet, [4, 4]);
    assert.match(result.content, /Raid damage: 8/);
  } finally {
    Math.random = originalRandom;
  }
});

test("Roll Paradise reuses the normal double-roll modifier inside the active channel", () => {
  const originalRandom = Math.random;
  const randomValues = [0, 0.8];
  let randomIndex = 0;
  Math.random = () => {
    const value = randomValues[randomIndex] ?? 0;
    randomIndex += 1;
    return value;
  };

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 2,
          diceCountIncreasesTotal: 0,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
        setLastDiceRollAt: () => {},
      },
      pvp: {
        getActiveDiceLockout: () => null,
        getActiveDoubleRoll: () => null,
      },
      worldBossDoubleRollRush: {
        getActiveDoubleRollRushStatus: () => ({
          isActive: true,
          expiresAtMs: 1_710_000_900_000,
        }),
      },
      unitOfWork: {
        runInTransaction: (work) => work(),
      },
    });

    const result = useCase({
      userId: "rush-user",
      userMention: "<@rush-user>",
      channelId: "roll-paradise-channel",
      nowMs: 1_710_000_000_000,
    });

    assert.match(result.content, /Roll modifiers: Roll Paradise double ×2 → effective ×2\./);
    assert.match(
      result.content,
      /Roll Paradise is active in this channel for 15 minutes 0 seconds\./,
    );
  } finally {
    Math.random = originalRandom;
  }
});

test("Roll Paradise stacks with item double-roll buffs to reach x4", () => {
  const originalRandom = Math.random;
  const randomValues = [0, 0.1, 0.2, 0.3];
  let randomIndex = 0;
  Math.random = () => {
    const value = randomValues[randomIndex] ?? 0;
    randomIndex += 1;
    return value;
  };

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
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
        consumeOneDoubleRollUse: () => true,
        getItemDoubleRollStatus: () => ({
          isActive: true,
          remainingUses: 2,
          expiresAtMs: null,
        }),
      },
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 4,
          diceCountIncreasesTotal: 0,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
        setLastDiceRollAt: () => {},
      },
      pvp: {
        getActiveDiceLockout: () => null,
        getActiveDoubleRoll: () => null,
      },
      worldBossDoubleRollRush: {
        getActiveDoubleRollRushStatus: () => ({
          isActive: true,
          expiresAtMs: 1_710_000_900_000,
        }),
      },
      unitOfWork: {
        runInTransaction: (work) => work(),
      },
    });

    const result = useCase({
      userId: "rush-item-user",
      userMention: "<@rush-item-user>",
      channelId: "roll-paradise-channel",
      nowMs: 1_710_000_000_000,
    });

    assert.match(
      result.content,
      /Roll modifiers: double-roll buffs ×4 \(item \+ Roll Paradise\) → effective ×4\./,
    );
    assert.match(result.content, /Set 4:/);
  } finally {
    Math.random = originalRandom;
  }
});

test("manual rolls increment total /roll call analytics", () => {
  const originalRandom = Math.random;
  let recordedRollCommandCount = -1;
  Math.random = () => 0;

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
        recordDiceRollAnalytics: (update) => {
          recordedRollCommandCount = update.rollCommandCount;
        },
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 1,
          diceCountIncreasesTotal: 1,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
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

    useCase({
      userId: "user-manual",
      userMention: "<@user-manual>",
      source: "manual",
      nowMs: 1_710_000_000_000,
    });

    assert.equal(recordedRollCommandCount, 1);
  } finally {
    Math.random = originalRandom;
  }
});

test("roll uses the injected nowMs for charge and modifier labels", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const nowMs = 1_710_000_000_000;
    const useCase = createRunRollDiceUseCase({
      analytics: {
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 2,
          highestRollPassCount: 2,
          diceCountIncreasesTotal: 0,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => nowMs - (getDiceChargeStartMs() + 2 * minuteMs),
        getLastPersonalDiceRollAt: () => null,
        getUserDiceAchievements: () => ["manual-rolls-5"],
        setDiceCount: () => {},
        setLastDiceRollAt: () => {},
        setLastPersonalDiceRollAt: () => {},
      },
      pvp: {
        getActiveDiceLockout: () => null,
        getActiveDoubleRoll: () => nowMs + minuteMs,
      },
      unitOfWork: {
        runInTransaction: (work) => work(),
      },
    });

    const result = useCase({
      userId: "user-time-source",
      userMention: "<@user-time-source>",
      nowMs,
    });

    assert.match(result.content, /^2x Dice charge!/m);
    assert.match(result.content, /Other active roll modifiers: PvP double ×2\./);
    assert.doesNotMatch(result.content, /^100x Dice charge!/m);
  } finally {
    Math.random = originalRandom;
  }
});

test("roll suppresses charge before Beginner Roller is unlocked", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const nowMs = 1_710_000_000_000;
    const useCase = createRunRollDiceUseCase({
      analytics: {
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 2,
          diceCountIncreasesTotal: 0,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => nowMs - (getDiceChargeStartMs() + 2 * minuteMs),
        getLastPersonalDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
        setLastDiceRollAt: () => {},
        setLastPersonalDiceRollAt: () => {},
      },
      pvp: {
        getActiveDiceLockout: () => null,
        getActiveDoubleRoll: () => nowMs + minuteMs,
      },
      unitOfWork: {
        runInTransaction: (work) => work(),
      },
    });

    const result = useCase({
      userId: "user-beginner-charge-lock",
      userMention: "<@user-beginner-charge-lock>",
      nowMs,
    });

    assert.doesNotMatch(result.content, /^2x Dice charge!/m);
    assert.match(result.content, /Roll modifiers: PvP double ×2 → effective ×2\./);
  } finally {
    Math.random = originalRandom;
  }
});

test("global charge rolls do not reset personal charge progress", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  let personalChargeResetCount = 0;

  try {
    const nowMs = 1_710_000_000_000;
    const useCase = createRunRollDiceUseCase({
      analytics: {
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
            unlocked: true,
            minutesPerMultiplier: 10,
            speedMultiplier: 1,
            maxMultiplier: 5,
          },
        }),
      },
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 5,
          highestRollPassCount: 5,
          diceCountIncreasesTotal: 0,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => nowMs - (getDiceChargeStartMs() + 2 * minuteMs),
        getLastPersonalDiceRollAt: () => nowMs - 30 * minuteMs,
        getUserDiceAchievements: () => ["manual-rolls-5"],
        setDiceCount: () => {},
        setLastDiceRollAt: () => {},
        setLastPersonalDiceRollAt: () => {
          personalChargeResetCount += 1;
        },
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
      userId: "user-global-charge",
      userMention: "<@user-global-charge>",
      nowMs,
    });

    assert.match(result.content, /^5x Dice charge!/m);
    assert.equal(personalChargeResetCount, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test("auto rolls do not increment total /roll call analytics", () => {
  const originalRandom = Math.random;
  let recordedRollCommandCount = -1;
  Math.random = () => 0;

  try {
    const useCase = createRunRollDiceUseCase({
      analytics: {
        recordDiceRollAnalytics: (update) => {
          recordedRollCommandCount = update.rollCommandCount;
        },
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
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        ...createProgressionStub(),
        awardAchievements: () => [],
        consumeDiceTemporaryEffectsForRoll: () => 0,
        recordDiceProgressionAchievementStats: () => ({
          rollCommandsTotal: 1,
          nearDiceCountIncreaseRollsTotal: 0,
          highestChargeMultiplier: 1,
          highestRollPassCount: 1,
          diceCountIncreasesTotal: 1,
          firstBanAt: null,
        }),
        getActiveDiceTemporaryEffects: () => [],
        getDiceBans: () => new Map(),
        getDiceCount: () => 1,
        getDicePrestige: () => 0,
        getDiceSides: () => 6,
        getLastDiceRollAt: () => null,
        getUserDiceAchievements: () => [],
        setDiceCount: () => {},
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

    useCase({
      userId: "user-auto-analytics",
      userMention: "<@user-auto-analytics>",
      source: "auto",
      nowMs: 1_710_000_000_000,
    });

    assert.equal(recordedRollCommandCount, 0);
  } finally {
    Math.random = originalRandom;
  }
});
