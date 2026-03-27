import assert from "node:assert/strict";
import test from "node:test";
import { grantCasinoPayout } from "./helpers";

test("grantCasinoPayout preserves current balance for zero payouts", () => {
  let called = false;

  const result = grantCasinoPayout(
    {
      grantRewardPips: () => {
        called = true;
        return {
          awardedAmount: 999,
          pips: 999,
        };
      },
    },
    "user-1",
    0,
    42,
  );

  assert.equal(called, false);
  assert.deepEqual(result, {
    awardedPayout: 0,
    pips: 42,
  });
});

test("grantCasinoPayout uses the reward helper for positive payouts", () => {
  const result = grantCasinoPayout(
    {
      grantRewardPips: ({ userId, baseAmount }) => {
        assert.equal(userId, "user-1");
        assert.equal(baseAmount, 30);
        return {
          awardedAmount: 33,
          pips: 133,
        };
      },
    },
    "user-1",
    30,
    100,
  );

  assert.deepEqual(result, {
    awardedPayout: 33,
    pips: 133,
  });
});
