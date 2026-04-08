import assert from "node:assert/strict";
import test from "node:test";
import { buildDiceRollModifierFooter, createDiceRollModifierState } from "./roll-status";

test("roll modifier footer labels item-only double rolls correctly", () => {
  const footer = buildDiceRollModifierFooter({
    rollPassCount: 2,
    didUseChargeRoll: false,
    effectiveFactor: 2,
    hasActivePvpDoubleRoll: false,
    hasActiveItemDoubleRoll: true,
    hasActiveDoubleRollRush: false,
    globalChargeMultiplier: 1,
    personalChargeMultiplier: 1,
    combinedChargeMultiplier: 1,
    itemDoubleRollStatus: {
      isActive: true,
      remainingUses: 1,
      expiresAtMs: null,
    },
    temporaryEffectsRollSummary: {
      multiplier: 1,
      divisor: 1,
      effectiveFactor: 1,
      hasApplicableEffects: false,
      hasPositiveRollEffects: false,
      hasNegativeRollEffects: false,
    },
  });

  assert.equal(footer, "Roll modifiers: item double ×2 → effective ×2.");
});

test("roll modifier footer labels combined PvP and item double rolls correctly", () => {
  const footer = buildDiceRollModifierFooter({
    rollPassCount: 4,
    didUseChargeRoll: false,
    effectiveFactor: 4,
    hasActivePvpDoubleRoll: true,
    hasActiveItemDoubleRoll: true,
    hasActiveDoubleRollRush: false,
    globalChargeMultiplier: 1,
    personalChargeMultiplier: 1,
    combinedChargeMultiplier: 1,
    itemDoubleRollStatus: {
      isActive: true,
      remainingUses: 2,
      expiresAtMs: null,
    },
    temporaryEffectsRollSummary: {
      multiplier: 1,
      divisor: 1,
      effectiveFactor: 1,
      hasApplicableEffects: false,
      hasPositiveRollEffects: false,
      hasNegativeRollEffects: false,
    },
  });

  assert.equal(footer, "Roll modifiers: double-roll buffs ×4 (PvP + item) → effective ×4.");
});

test("roll modifier footer switches to 'other active' wording during charged rolls", () => {
  const footer = buildDiceRollModifierFooter({
    rollPassCount: 3,
    didUseChargeRoll: true,
    effectiveFactor: 3,
    hasActivePvpDoubleRoll: false,
    hasActiveItemDoubleRoll: false,
    hasActiveDoubleRollRush: false,
    globalChargeMultiplier: 2,
    personalChargeMultiplier: 1,
    combinedChargeMultiplier: 2,
    itemDoubleRollStatus: {
      isActive: false,
      remainingUses: 0,
      expiresAtMs: null,
    },
    temporaryEffectsRollSummary: {
      multiplier: 4,
      divisor: 2,
      effectiveFactor: 2,
      hasApplicableEffects: true,
      hasPositiveRollEffects: true,
      hasNegativeRollEffects: true,
    },
  });

  assert.equal(footer, "Other active roll modifiers: temporary buffs ×4 · temporary penalty ÷2.");
});

test("roll modifier footer includes Double Roll Rush as a double-roll source", () => {
  const footer = buildDiceRollModifierFooter({
    rollPassCount: 2,
    didUseChargeRoll: false,
    effectiveFactor: 2,
    hasActivePvpDoubleRoll: false,
    hasActiveItemDoubleRoll: false,
    hasActiveDoubleRollRush: true,
    globalChargeMultiplier: 1,
    personalChargeMultiplier: 1,
    combinedChargeMultiplier: 1,
    itemDoubleRollStatus: {
      isActive: false,
      remainingUses: 0,
      expiresAtMs: null,
    },
    temporaryEffectsRollSummary: {
      multiplier: 1,
      divisor: 1,
      effectiveFactor: 1,
      hasApplicableEffects: false,
      hasPositiveRollEffects: false,
      hasNegativeRollEffects: false,
    },
  });

  assert.equal(footer, "Roll modifiers: Rush double ×2 → effective ×2.");
});

test("stacked double-roll sources increase effective roll power", () => {
  const state = createDiceRollModifierState({
    prestige: 0,
    lastGlobalRollAtMs: null,
    lastPersonalRollAtMs: null,
    personalChargeBonus: {
      unlocked: false,
      minutesPerMultiplier: 0,
      speedMultiplier: 1,
      maxMultiplier: 1,
    },
    pvpDoubleRollUntilMs: Date.parse("2026-04-08T12:10:00.000Z"),
    itemDoubleRollStatus: {
      isActive: true,
      remainingUses: 2,
      expiresAtMs: null,
    },
    hasActiveDoubleRollRush: false,
    temporaryEffects: [],
    nowMs: Date.parse("2026-04-08T12:00:00.000Z"),
  });

  assert.equal(state.rollPassCount, 4);
  assert.equal(state.effectiveFactor, 4);
});
