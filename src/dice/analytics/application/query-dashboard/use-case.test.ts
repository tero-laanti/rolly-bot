import assert from "node:assert/strict";
import test from "node:test";
import {
  mysteriousDieSeedItemId,
  seedSatchelItemId,
} from "../../../inventory/domain/passive-items";
import { getDiceBanStep, getDiceChargeStartMs } from "../../../progression/domain/game-rules";
import { minuteMs } from "../../../../shared/time";
import { createQueryDiceStatsUseCase } from "./use-case";

const createUseCase = (
  overrides: {
    analytics?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["analytics"]>;
    economy?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["economy"]>;
    garden?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["garden"]>;
    inventory?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["inventory"]>;
    itemEffects?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["itemEffects"]>;
    permanentBonuses?: Partial<
      Parameters<typeof createQueryDiceStatsUseCase>[0]["permanentBonuses"]
    >;
    progression?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["progression"]>;
    pvp?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["pvp"]>;
  } = {},
) => {
  return createQueryDiceStatsUseCase({
    analytics: {
      getDiceAnalytics: () => ({
        diceCountStartedAt: "2026-03-20T10:00:00.000Z",
        prestigeStartedAt: "2026-03-18T10:00:00.000Z",
        rollSetsCurrentDiceCount: 12,
        nearDiceCountIncreaseRollSetsCurrentDiceCount: 3,
        diceRolledCurrentPrestige: 48,
        totalDiceRolled: 240,
        totalDiceSetsRolled: 80,
        totalRollCommandsCalled: 55,
        pvpWins: 4,
        pvpLosses: 2,
        pvpDraws: 1,
      }),
      ...overrides.analytics,
    },
    economy: {
      getEconomySnapshot: () => ({
        fame: 7,
        pips: 13,
      }),
      ...overrides.economy,
    },
    garden: {
      getActiveGardenPlots: () => [],
      getGardenAchievementStats: () => ({
        plantedSeedCount: 0,
        harvestedSeedCount: 0,
        harvestedD12Count: 0,
      }),
      ...overrides.garden,
    },
    inventory: {
      getInventoryQuantities: () => new Map(),
      ...overrides.inventory,
    },
    itemEffects: {
      getItemDoubleRollStatus: () => ({
        isActive: false,
        remainingUses: 0,
        expiresAtMs: null,
      }),
      ...overrides.itemEffects,
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
      ...overrides.permanentBonuses,
    },
    progression: {
      getActiveDicePrestige: () => 1,
      getActiveDiceTemporaryEffects: () => [],
      getDiceBans: () => new Map(),
      getDiceCount: () => 3,
      getDicePrestige: () => 2,
      getDiceSides: () => 10,
      getLastDiceRollAt: () => null,
      getLastPersonalDiceRollAt: () => null,
      ...overrides.progression,
    },
    pvp: {
      getActiveDoubleRoll: () => null,
      ...overrides.pvp,
    },
  });
};

test("stats dashboard shows baseline economy progression and analytics data", () => {
  const fame = 7;
  const banStep = getDiceBanStep();
  const expectedUnlockedSlots = Math.max(0, Math.floor(fame / banStep));
  const expectedNextUnlockAt = (Math.floor(fame / banStep) + 1) * banStep;
  const expectedRemainingFame = expectedNextUnlockAt - fame;
  const useCase = createUseCase();

  const result = useCase({
    userId: "user-1",
    userMention: "<@user-1>",
    nowMs: Date.parse("2026-03-27T10:00:00.000Z"),
  });

  assert.equal(result.ephemeral, false);
  assert.equal(
    result.content,
    [
      "**Rolly Stats for <@user-1>**",
      "",
      "**Economy**",
      "Fame: **7** | Pips: **13**",
      "",
      "**Progression**",
      "Dice: **3 dice** on **D10**",
      "Prestige: active **1** | best **2**",
      "",
      "**Roll Status**",
      "Current /roll power: **×1**",
      "Charge: none",
      "Double rolls: none",
      "Temporary effects: none",
      "",
      "**Bans**",
      `Ban slots: **0/${expectedUnlockedSlots}** used`,
      `Next unlock: **${expectedNextUnlockAt} Fame (+${expectedRemainingFame})**`,
      "Current bans: none",
      "",
      "**Analytics**",
      "Current dice: **7d** | **12** sets | **3** one-offs",
      "Current prestige: **9d** | **48** dice rolled",
      "Lifetime: **240** dice | **80** sets | **55** /roll calls",
      "PvP: **4W / 2L / 1D**",
    ].join("\n"),
  );
});

test("stats dashboard shows permanent bonuses and personal charge configuration", () => {
  const fame = 16;
  const banStep = getDiceBanStep();
  const expectedUnlockedSlots = Math.max(0, Math.floor(fame / banStep)) + 2;
  const expectedNextUnlockAt = (Math.floor(fame / banStep) + 1) * banStep;
  const expectedRemainingFame = expectedNextUnlockAt - fame;
  const useCase = createUseCase({
    economy: {
      getEconomySnapshot: () => ({
        fame: 16,
        pips: 25,
      }),
    },
    permanentBonuses: {
      getPermanentBonuses: () => ({
        extraBanSlots: 2,
        pipRewardBonusPercent: 15,
        personalCharge: {
          unlocked: true,
          minutesPerMultiplier: 12,
          speedMultiplier: 1.5,
          maxMultiplier: 5,
        },
      }),
    },
  });

  const result = useCase({
    userId: "user-2",
    userMention: "<@user-2>",
    nowMs: Date.parse("2026-03-27T10:00:00.000Z"),
  });

  assert.match(
    result.content,
    new RegExp(`Ban slots: \\*\\*0/${expectedUnlockedSlots}\\*\\* used`),
  );
  assert.match(
    result.content,
    new RegExp(
      `Next unlock: \\*\\*${expectedNextUnlockAt} Fame \\(\\+${expectedRemainingFame}\\)\\*\\*`,
    ),
  );
  assert.match(
    result.content,
    /Permanent bonuses: \+2 ban slots \| \+15% pip rewards \| personal charge every 12m, up to ×5/,
  );
});

test("stats dashboard shows active roll effects and charge state", () => {
  const nowMs = Date.parse("2026-03-27T10:00:00.000Z");
  const globalChargeAtMs = nowMs - (getDiceChargeStartMs() + 2 * minuteMs);
  const useCase = createUseCase({
    itemEffects: {
      getItemDoubleRollStatus: () => ({
        isActive: true,
        remainingUses: 2,
        expiresAtMs: nowMs + 15 * 60 * 1000,
      }),
    },
    permanentBonuses: {
      getPermanentBonuses: () => ({
        extraBanSlots: 1,
        pipRewardBonusPercent: 10,
        personalCharge: {
          unlocked: true,
          minutesPerMultiplier: 10,
          speedMultiplier: 1,
          maxMultiplier: 4,
        },
      }),
    },
    progression: {
      getActiveDiceTemporaryEffects: () => [
        {
          id: "buff",
          userId: "user-3",
          effectCode: "roll-pass-multiplier",
          kind: "positive",
          source: "event",
          magnitude: 2,
          remainingRolls: 1,
          expiresAt: null,
          consumeOnCommand: "dice",
          stackGroup: "buff",
          createdAt: "2026-03-27T09:00:00.000Z",
          updatedAt: "2026-03-27T09:00:00.000Z",
        },
        {
          id: "penalty",
          userId: "user-3",
          effectCode: "roll-pass-divisor",
          kind: "negative",
          source: "event",
          magnitude: 2,
          remainingRolls: 1,
          expiresAt: null,
          consumeOnCommand: "dice",
          stackGroup: "penalty",
          createdAt: "2026-03-27T09:00:00.000Z",
          updatedAt: "2026-03-27T09:00:00.000Z",
        },
      ],
      getLastDiceRollAt: () => globalChargeAtMs,
      getLastPersonalDiceRollAt: () => nowMs - 30 * 60 * 1000,
    },
    pvp: {
      getActiveDoubleRoll: () => nowMs + 20 * 60 * 1000,
    },
  });

  const result = useCase({
    userId: "user-3",
    userMention: "<@user-3>",
    nowMs,
  });

  assert.match(result.content, /Current \/roll power: \*\*×5\*\*/);
  assert.match(result.content, /Charge: global charge ×2 \| personal charge ×4 \| combined ×5/);
  assert.match(
    result.content,
    /Double rolls: PvP double-roll ×2 \(20m\) \| item double-roll ×2 \(2 uses, 15m\)/,
  );
  assert.match(result.content, /Temporary effects: buffs ×2 \| penalties ÷2/);
});

test("stats dashboard keeps single-source charge labels concise", () => {
  const nowMs = Date.parse("2026-03-27T10:00:00.000Z");
  const globalChargeAtMs = nowMs - (getDiceChargeStartMs() + 2 * minuteMs);
  const useCase = createUseCase({
    progression: {
      getLastDiceRollAt: () => globalChargeAtMs,
      getLastPersonalDiceRollAt: () => null,
    },
  });

  const result = useCase({
    userId: "user-6",
    userMention: "<@user-6>",
    nowMs,
  });

  assert.match(result.content, /Charge: global charge ×2/);
  assert.doesNotMatch(result.content, /combined ×2/);
});

test("stats dashboard reports the next fame-based ban unlock at exact thresholds", () => {
  const fame = 9;
  const banStep = getDiceBanStep();
  const expectedUnlockedSlots = Math.max(0, Math.floor(fame / banStep));
  const expectedNextUnlockAt = (Math.floor(fame / banStep) + 1) * banStep;
  const expectedRemainingFame = expectedNextUnlockAt - fame;
  const useCase = createUseCase({
    economy: {
      getEconomySnapshot: () => ({
        fame: 9,
        pips: 2,
      }),
    },
  });

  const result = useCase({
    userId: "user-4",
    userMention: "<@user-4>",
    nowMs: Date.parse("2026-03-27T10:00:00.000Z"),
  });

  assert.match(
    result.content,
    new RegExp(`Ban slots: \\*\\*0/${expectedUnlockedSlots}\\*\\* used`),
  );
  assert.match(
    result.content,
    new RegExp(
      `Next unlock: \\*\\*${expectedNextUnlockAt} Fame \\(\\+${expectedRemainingFame}\\)\\*\\*`,
    ),
  );
});

test("stats dashboard shows garden stats when Seed Satchel is owned", () => {
  const nowMs = Date.parse("2026-03-27T10:00:00.000Z");
  const useCase = createUseCase({
    garden: {
      getActiveGardenPlots: () => [
        {
          userId: "user-garden",
          slotIndex: 0,
          seedItemId: mysteriousDieSeedItemId,
          dieSides: 8,
          plantedAt: "2026-03-27T09:00:00.000Z",
          readyAt: "2026-03-27T10:43:00.000Z",
          updatedAt: "2026-03-27T09:00:00.000Z",
        },
      ],
      getGardenAchievementStats: () => ({
        plantedSeedCount: 14,
        harvestedSeedCount: 11,
        harvestedD12Count: 1,
      }),
    },
    inventory: {
      getInventoryQuantities: () =>
        new Map([
          [seedSatchelItemId, 1],
          [mysteriousDieSeedItemId, 2],
        ]),
    },
  });

  const result = useCase({
    userId: "user-garden",
    userMention: "<@user-garden>",
    nowMs,
  });

  assert.match(result.content, /\*\*Garden\*\*/);
  assert.match(result.content, /Seeds: \*\*2\*\* in satchel \| Harvested: \*\*11\*\*/);
  assert.match(result.content, /Current plot: \*\*D8\*\* sapling, ready \*\*in 43m\*\*/);
});

test("stats dashboard shows an empty current plot when the garden is unlocked", () => {
  const useCase = createUseCase({
    garden: {
      getGardenAchievementStats: () => ({
        plantedSeedCount: 4,
        harvestedSeedCount: 3,
        harvestedD12Count: 0,
      }),
    },
    inventory: {
      getInventoryQuantities: () =>
        new Map([
          [seedSatchelItemId, 1],
          [mysteriousDieSeedItemId, 0],
        ]),
    },
  });

  const result = useCase({
    userId: "user-empty-garden",
    userMention: "<@user-empty-garden>",
    nowMs: Date.parse("2026-03-27T10:00:00.000Z"),
  });

  assert.match(result.content, /Seeds: \*\*0\*\* in satchel \| Harvested: \*\*3\*\*/);
  assert.match(result.content, /Current plot: empty/);
});

test("stats dashboard keeps long ban summaries within Discord's message limit", () => {
  const bans = new Map<number, Set<number>>();
  for (let dieIndex = 1; dieIndex <= 30; dieIndex += 1) {
    bans.set(dieIndex, new Set(Array.from({ length: 20 }, (_, index) => index + 1)));
  }

  const useCase = createUseCase({
    progression: {
      getDiceBans: () => bans,
      getDiceCount: () => 30,
      getDiceSides: () => 20,
    },
  });

  const result = useCase({
    userId: "user-5",
    userMention: "<@user-5>",
    nowMs: Date.parse("2026-03-27T10:00:00.000Z"),
  });

  assert.equal(result.content.length <= 2_000, true);
});
