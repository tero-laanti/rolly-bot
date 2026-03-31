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
  const result = grantCasinoPayout(
    {
      applyPipsDelta: ({ userId, amount }) => {
        assert.equal(userId, "user-1");
        assert.equal(amount, 10);
        return 110;
      },
    },
    "user-1",
    10,
    10,
    100,
  );

  assert.deepEqual(result, {
    awardedPayout: 10,
    pips: 110,
  });
});

test("grantCasinoPayout applies the full payout directly without reward bonuses", () => {
  const result = grantCasinoPayout(
    {
      applyPipsDelta: ({ userId, amount }) => {
        assert.equal(userId, "user-1");
        assert.equal(amount, 30);
        return 130;
      },
    },
    "user-1",
    30,
    10,
    100,
  );

  assert.deepEqual(result, {
    awardedPayout: 30,
    pips: 130,
  });
});
