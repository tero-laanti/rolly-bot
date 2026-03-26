import assert from "node:assert/strict";
import test from "node:test";
import { getRandomEventContentPackV1 } from "../../../rolly-data/load";
import { getRandomEventFlow, type RandomEventEffect, type RandomEventScenario } from "./content";
import type { RandomEventRarityTier } from "./variety";

const rewardBands = {
  common: {
    baseline: { min: 2, max: 4 },
    challenge: { min: 3, max: 5 },
  },
  uncommon: {
    baseline: { min: 4, max: 6 },
    challenge: { min: 6, max: 8 },
    "multi-user": { min: 6, max: 9 },
  },
  rare: {
    baseline: { min: 7, max: 10 },
    challenge: { min: 9, max: 13 },
    sequence: { min: 10, max: 14 },
    "multi-user": { min: 10, max: 14 },
  },
  epic: {
    baseline: { min: 11, max: 18 },
    challenge: { min: 14, max: 20 },
    sequence: { min: 16, max: 24 },
    "multi-user": { min: 16, max: 24 },
  },
  legendary: {
    baseline: { min: 20, max: 30 },
    challenge: { min: 24, max: 34 },
    sequence: { min: 28, max: 40 },
    "multi-user": { min: 28, max: 40 },
  },
} as const;

const penaltyBands = {
  common: {
    divisor: { min: 2, max: 3 },
    rolls: { min: 1, max: 2 },
    lockoutMinutes: { min: 2, max: 4 },
  },
  uncommon: {
    divisor: { min: 2, max: 3 },
    rolls: { min: 2, max: 3 },
    lockoutMinutes: { min: 3, max: 5 },
  },
  rare: {
    divisor: { min: 2, max: 4 },
    rolls: { min: 3, max: 5 },
    lockoutMinutes: { min: 5, max: 8 },
  },
  epic: {
    divisor: { min: 3, max: 4 },
    rolls: { min: 6, max: 10 },
    lockoutMinutes: { min: 8, max: 12 },
  },
  legendary: {
    divisor: { min: 4, max: 6 },
    rolls: { min: 8, max: 12 },
    lockoutMinutes: { min: 12, max: 18 },
  },
} as const;

type RewardProfile = "baseline" | "challenge" | "sequence" | "multi-user";

const stagedGroupMeterTotalBands: Partial<
  Record<RandomEventRarityTier, { min: number; max: number }>
> = {
  rare: { min: 16, max: 20 },
  epic: { min: 24, max: 34 },
  legendary: { min: 34, max: 44 },
};

const sumCurrencyEffects = (
  effects: RandomEventEffect[],
): { minAmount: number; maxAmount: number; count: number } => {
  return effects.reduce(
    (sum, effect) => {
      if (effect.type !== "currency") {
        return sum;
      }

      return {
        minAmount: sum.minAmount + effect.minAmount,
        maxAmount: sum.maxAmount + effect.maxAmount,
        count: sum.count + 1,
      };
    },
    { minAmount: 0, maxAmount: 0, count: 0 },
  );
};

const getRewardProfile = (scenario: RandomEventScenario): RewardProfile => {
  if (scenario.claimPolicy === "multi-user") {
    return "multi-user";
  }

  const challenge = scenario.rollChallenge;
  if (!challenge) {
    return "baseline";
  }

  return challenge.mode === "sequence" ? "sequence" : "challenge";
};

const getExpectedRewardBand = (scenario: RandomEventScenario): { min: number; max: number } => {
  const profile = getRewardProfile(scenario);
  const bands = rewardBands[scenario.rarity];

  if (profile === "multi-user" && "multi-user" in bands) {
    return bands["multi-user"];
  }

  if (profile === "sequence" && "sequence" in bands) {
    return bands.sequence;
  }

  if (profile === "challenge" && "challenge" in bands) {
    return bands.challenge;
  }

  return bands.baseline;
};

const loadScenarios = (): RandomEventScenario[] => getRandomEventContentPackV1();

test("successful random-event outcomes award pip ranges that match rarity profiles", () => {
  for (const scenario of loadScenarios()) {
    if (scenario.id.startsWith("example-")) {
      continue;
    }

    const flow = getRandomEventFlow(scenario);

    if (flow.type === "solo-ladder" || flow.type === "solo-push-your-luck") {
      const expected = getExpectedRewardBand({
        ...scenario,
        rollChallenge: { id: `${scenario.id}-staged`, mode: "sequence", steps: [] },
      });
      const totalCurrency = sumCurrencyEffects(
        flow.stages.flatMap((stage) => stage.successEffects),
      );
      assert.ok(totalCurrency.count > 0, `${scenario.id} should award currency across its stages`);
      assert.ok(
        totalCurrency.minAmount >= expected.min && totalCurrency.maxAmount <= expected.max,
        `${scenario.id} staged total ${totalCurrency.minAmount}-${totalCurrency.maxAmount} is outside ${expected.min}-${expected.max}`,
      );
      continue;
    }

    if (flow.type === "group-meter") {
      const expected =
        stagedGroupMeterTotalBands[scenario.rarity] ?? getExpectedRewardBand(scenario);
      const totalCurrency = sumCurrencyEffects(
        flow.stages.flatMap((stage) => stage.successEffects),
      );
      assert.ok(totalCurrency.count > 0, `${scenario.id} should award currency across its stages`);
      assert.ok(
        totalCurrency.minAmount >= expected.min && totalCurrency.maxAmount <= expected.max,
        `${scenario.id} staged group-meter total ${totalCurrency.minAmount}-${totalCurrency.maxAmount} is outside ${expected.min}-${expected.max}`,
      );
      continue;
    }

    const expected = getExpectedRewardBand(scenario);
    for (const outcome of scenario.outcomes) {
      if (outcome.resolution !== "resolve-success") {
        continue;
      }

      const currencyEffects = outcome.effects.filter((effect) => effect.type === "currency");
      const itemEffects = outcome.effects.filter((effect) => effect.type === "consumable-item");
      if (currencyEffects.length === 0) {
        assert.equal(
          itemEffects.length,
          1,
          `${scenario.id}/${outcome.id} item-only successes should have exactly one consumable reward`,
        );
        assert.equal(
          flow.type,
          "stake-offer",
          `${scenario.id}/${outcome.id} item-only successes are only supported for stake-offer flows`,
        );
        continue;
      }

      if (flow.type === "stake-offer") {
        assert.equal(
          currencyEffects.length,
          1,
          `${scenario.id}/${outcome.id} stake-offer successes should have exactly one currency effect`,
        );
        assert.ok(
          currencyEffects[0]?.minAmount > flow.stakePips,
          `${scenario.id}/${outcome.id} stake-offer success should return more than the stake`,
        );
        assert.ok(
          currencyEffects[0]?.maxAmount <= expected.max,
          `${scenario.id}/${outcome.id} stake-offer max payout should stay at or below ${expected.max}`,
        );
        continue;
      }

      if (itemEffects.length > 0) {
        assert.equal(
          currencyEffects.length,
          1,
          `${scenario.id}/${outcome.id} mixed item rewards should have exactly one currency effect`,
        );
        assert.ok(
          currencyEffects[0]?.minAmount >= 1 &&
            currencyEffects[0]?.minAmount <= currencyEffects[0].maxAmount,
          `${scenario.id}/${outcome.id} mixed item min payout should stay positive and not exceed max payout`,
        );
        assert.ok(
          currencyEffects[0]?.maxAmount <= expected.max,
          `${scenario.id}/${outcome.id} mixed item max payout should stay at or below ${expected.max}`,
        );
        continue;
      }

      assert.equal(
        currencyEffects.length,
        1,
        `${scenario.id}/${outcome.id} should have exactly one currency effect`,
      );
      assert.equal(currencyEffects[0]?.minAmount, expected.min, `${scenario.id}/${outcome.id}`);
      assert.equal(currencyEffects[0]?.maxAmount, expected.max, `${scenario.id}/${outcome.id}`);
    }
  }
});

test("failure penalties stay inside the rarity ladder", () => {
  for (const scenario of loadScenarios()) {
    if (scenario.id.startsWith("example-")) {
      continue;
    }

    const expected = penaltyBands[scenario.rarity];
    const flow = getRandomEventFlow(scenario);
    const failureEntries =
      flow.type === "single-resolution" || flow.type === "stake-offer"
        ? scenario.outcomes
            .filter((outcome) => outcome.resolution !== "resolve-success")
            .map((outcome) => ({
              id: outcome.id,
              effects: outcome.effects,
            }))
        : flow.stages
            .filter((stage) => (stage.failureEffects?.length ?? 0) > 0)
            .map((stage) => ({
              id: stage.id,
              effects: stage.failureEffects ?? [],
            }));

    for (const entry of failureEntries) {
      const negativeEffects = entry.effects.filter(
        (effect) => effect.type === "temporary-roll-penalty" || effect.type === "temporary-lockout",
      );
      assert.ok(
        negativeEffects.length > 0,
        `${scenario.id}/${entry.id} should include a negative effect`,
      );

      for (const effect of entry.effects) {
        if (effect.type === "temporary-roll-penalty") {
          assert.ok(
            effect.divisor >= expected.divisor.min && effect.divisor <= expected.divisor.max,
            `${scenario.id}/${entry.id} divisor ${effect.divisor} is outside ${expected.divisor.min}-${expected.divisor.max}`,
          );
          assert.ok(
            effect.rolls >= expected.rolls.min && effect.rolls <= expected.rolls.max,
            `${scenario.id}/${entry.id} rolls ${effect.rolls} is outside ${expected.rolls.min}-${expected.rolls.max}`,
          );
        }

        if (effect.type === "temporary-lockout") {
          assert.ok(
            effect.durationMinutes >= expected.lockoutMinutes.min &&
              effect.durationMinutes <= expected.lockoutMinutes.max,
            `${scenario.id}/${entry.id} lockout ${effect.durationMinutes} is outside ${expected.lockoutMinutes.min}-${expected.lockoutMinutes.max}`,
          );
        }
      }
    }
  }
});

test("sequence challenges do not stack more than one exact-match gate", () => {
  for (const scenario of loadScenarios()) {
    if (scenario.id.startsWith("example-")) {
      continue;
    }

    const challenge = scenario.rollChallenge;
    if (!challenge || challenge.mode !== "sequence") {
      continue;
    }

    const exactSteps = challenge.steps.filter((step) => step.comparator === "eq");
    assert.ok(
      exactSteps.length <= 1,
      `${scenario.id} has more than one exact-match sequence step.`,
    );

    for (const step of exactSteps) {
      if (step.source.type === "static-die") {
        assert.ok(
          step.source.sides <= 10,
          `${scenario.id}/${step.id} uses exact-match on d${step.source.sides}, expected d10 or smaller.`,
        );
      }
    }
  }
});
