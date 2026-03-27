import assert from "node:assert/strict";
import test from "node:test";
import { buildDiceRollModifierFooter } from "./roll-status";

test("roll modifier footer labels item-only double rolls correctly", () => {
  const footer = buildDiceRollModifierFooter({
    rollPassCount: 2,
    didUseChargeRoll: false,
    effectiveFactor: 2,
    hasActivePvpDoubleRoll: false,
    hasActiveItemDoubleRoll: true,
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
    rollPassCount: 2,
    didUseChargeRoll: false,
    effectiveFactor: 2,
    hasActivePvpDoubleRoll: true,
    hasActiveItemDoubleRoll: true,
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

  assert.equal(footer, "Roll modifiers: double-roll buff ×2 (PvP + item) → effective ×2.");
});

test("roll modifier footer switches to 'other active' wording during charged rolls", () => {
  const footer = buildDiceRollModifierFooter({
    rollPassCount: 3,
    didUseChargeRoll: true,
    effectiveFactor: 3,
    hasActivePvpDoubleRoll: false,
    hasActiveItemDoubleRoll: false,
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
