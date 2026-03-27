import assert from "node:assert/strict";
import test from "node:test";
import { getDiceBanStep, getDiceChargeStartMs } from "../../../progression/domain/game-rules";
import { minuteMs } from "../../../../shared/time";
import { createQueryDiceStatsUseCase } from "./use-case";

const createUseCase = (
  overrides: {
    analytics?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["analytics"]>;
    economy?: Partial<Parameters<typeof createQueryDiceStatsUseCase>[0]["economy"]>;
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
  assert.match(result.content, /\*\*Rolly Stats for <@user-1>\*\*/);
  assert.match(result.content, /Economy: 7 Fame \| 13 Pips\./);
  assert.match(
    result.content,
    /Progression: 3 dice on D10 \| active prestige 1 \| highest prestige 2\./,
  );
  assert.match(
    result.content,
    new RegExp(
      `Bans: 0/${expectedUnlockedSlots} used \\| next Fame unlock at ${expectedNextUnlockAt} \\(\\+${expectedRemainingFame}\\) \\| current bans none\\.`,
    ),
  );
  assert.match(result.content, /Permanent bonuses: none\./);
  assert.match(result.content, /Active roll status: none\./);
  assert.match(result.content, /Current \/roll power: ×1\./);
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
    new RegExp(
      `Bans: 0/${expectedUnlockedSlots} used \\| next Fame unlock at ${expectedNextUnlockAt} \\(\\+${expectedRemainingFame}\\)`,
    ),
  );
  assert.match(
    result.content,
    /Permanent bonuses: \+2 ban slots \| \+15% pip rewards \| personal charge every 12 minutes up to ×5\./,
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

  assert.match(result.content, /Active roll status: .*global charge ×2/);
  assert.match(result.content, /Active roll status: .*personal charge ×4/);
  assert.match(result.content, /Active roll status: .*current charge ×5/);
  assert.match(result.content, /Active roll status: .*PvP double ×2 for 20 minutes 0 seconds/);
  assert.match(result.content, /Active roll status: .*item double 2 uses for 15 minutes 0 seconds/);
  assert.match(result.content, /Active roll status: .*temporary buffs ×2/);
  assert.match(result.content, /Active roll status: .*temporary penalties ÷2/);
  assert.match(result.content, /Current \/roll power: ×5\./);
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
    new RegExp(
      `Bans: 0/${expectedUnlockedSlots} used \\| next Fame unlock at ${expectedNextUnlockAt} \\(\\+${expectedRemainingFame}\\)`,
    ),
  );
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
