import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultRaidReward } from "./raid";

test("raid pip reward formula stays flat through level 5 and scales from level 6", () => {
  assert.equal(getDefaultRaidReward(1).pips, 5);
  assert.equal(getDefaultRaidReward(5).pips, 5);
  assert.equal(getDefaultRaidReward(6).pips, 6);
  assert.equal(getDefaultRaidReward(35).pips, 35);
});

