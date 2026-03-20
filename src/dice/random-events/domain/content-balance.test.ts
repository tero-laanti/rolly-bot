import assert from "node:assert/strict";
import test from "node:test";
import { getRandomEventContentPackV1 } from "../../../rolly-data/load";

const expectedRanges = {
  common: { min: 1, max: 3 },
  uncommon: { min: 4, max: 6 },
  rare: { min: 7, max: 10 },
  epic: { min: 11, max: 20 },
  legendary: { min: 25, max: 50 },
} as const;

test("successful random-event outcomes award pip ranges that match rarity", () => {
  for (const scenario of getRandomEventContentPackV1()) {
    const expected = expectedRanges[scenario.rarity];

    for (const outcome of scenario.outcomes) {
      if (outcome.resolution !== "resolve-success") {
        continue;
      }

      const currencyEffects = outcome.effects.filter((effect) => effect.type === "currency");

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
