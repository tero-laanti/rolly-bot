import assert from "node:assert/strict";
import test from "node:test";
import { minuteMs } from "../../../shared/time";
import {
  applyPvpLoserLockoutReduction,
  getBadLuckUmbrellaCharges,
  getCleanseSaltShieldCharges,
} from "./passive-items";

test("passive inventory bonuses apply umbrella, cleanse, and PvP lockout reductions", () => {
  const ownedQuantities = new Map<string, number>([
    ["umbrella-harness", 1],
    ["clean-room-kit", 1],
    ["padded-bracers", 1],
  ]);

  assert.equal(getBadLuckUmbrellaCharges(1, ownedQuantities), 2);
  assert.equal(getCleanseSaltShieldCharges(ownedQuantities), 1);
  assert.equal(applyPvpLoserLockoutReduction(60 * minuteMs, ownedQuantities), 51 * minuteMs);
});

test("padded bracers never reduce lockout below 15 minutes", () => {
  const ownedQuantities = new Map<string, number>([["padded-bracers", 1]]);

  assert.equal(applyPvpLoserLockoutReduction(10 * minuteMs, ownedQuantities), 15 * minuteMs);
});
