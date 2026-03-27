import assert from "node:assert/strict";
import test from "node:test";
import { grantCasinoPayout } from "./helpers";

test("grantCasinoPayout preserves current balance for zero payouts", () => {
  let called = false;

  const result = grantCasinoPayout(
    {
      applyPipsDelta: () => {
        called = true;
        return 999;
      },
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
    10,
    42,
  );

  assert.equal(called, false);
  assert.deepEqual(result, {
    awardedPayout: 0,
    pips: 42,
  });
});

test("grantCasinoPayout returns refunded stakes without applying reward bonuses", () => {
  let rewardCalled = false;

  const result = grantCasinoPayout(
    {
      applyPipsDelta: ({ userId, amount }) => {
        assert.equal(userId, "user-1");
        assert.equal(amount, 10);
        return 110;
      },
      grantRewardPips: () => {
        rewardCalled = true;
        return {
          awardedAmount: 999,
          pips: 999,
        };
      },
    },
    "user-1",
    10,
    10,
    100,
  );

  assert.equal(rewardCalled, false);
  assert.deepEqual(result, {
    awardedPayout: 10,
    pips: 110,
  });
});

test("grantCasinoPayout applies reward bonuses only to winnings beyond the refunded stake", () => {
  const result = grantCasinoPayout(
    {
      applyPipsDelta: ({ userId, amount }) => {
        assert.equal(userId, "user-1");
        assert.equal(amount, 10);
        return 110;
      },
      grantRewardPips: ({ userId, baseAmount }) => {
        assert.equal(userId, "user-1");
        assert.equal(baseAmount, 20);
        return {
          awardedAmount: 24,
          pips: 134,
        };
      },
    },
    "user-1",
    30,
    10,
    100,
  );

  assert.deepEqual(result, {
    awardedPayout: 34,
    pips: 134,
  });
});
