import assert from "node:assert/strict";
import test from "node:test";
import { calculateRaidBossMaxHp, createRaidBoss, getDefaultRaidReward } from "./raid";

test("raid pip reward formula stays flat through level 5 and scales from level 6", () => {
  assert.equal(getDefaultRaidReward(1).pips, 5);
  assert.equal(getDefaultRaidReward(5).pips, 5);
  assert.equal(getDefaultRaidReward(6).pips, 6);
  assert.equal(getDefaultRaidReward(35).pips, 35);
});

test("raid boss hp scales by 3 percent per boss level", () => {
  assert.equal(calculateRaidBossMaxHp(1), 120);
  assert.equal(calculateRaidBossMaxHp(30), 283);
  assert.equal(calculateRaidBossMaxHp(50), 511);
});

test("raid boss level roll is low-heavy and capped at level 50", () => {
  const levelOneBoss = createRaidBoss({
    random: () => 0,
  });
  const levelFiftyBoss = createRaidBoss({
    random: () => 0.999999,
  });

  assert.equal(levelOneBoss.level, 1);
  assert.equal(levelOneBoss.maxHp, 120);
  assert.equal(levelFiftyBoss.level, 50);
  assert.equal(levelFiftyBoss.maxHp, 511);
});
