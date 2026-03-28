import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRaidBossMaxHp,
  calculateRaidBossMaxHpForStrength,
  calculateRaidParticipantStrength,
  createRaidBoss,
  describeAppliedRaidReward,
  getDefaultRaidReward,
} from "./raid";

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

test("raid prestige strength uses the configured prestige multiplier", () => {
  assert.equal(calculateRaidParticipantStrength(0), 1);
  assert.equal(calculateRaidParticipantStrength(1), 1.5);
  assert.equal(calculateRaidParticipantStrength(2), 2.25);
  assert.equal(calculateRaidParticipantStrength(3), 3.375);
  assert.equal(calculateRaidParticipantStrength(4), 5.0625);
  assert.equal(calculateRaidParticipantStrength(5), 7.59375);
  assert.equal(calculateRaidParticipantStrength(8), 25.62890625);
});

test("raid boss hp scales by summed raider strength without a cap", () => {
  assert.equal(calculateRaidBossMaxHpForStrength(6, 1), 139);
  assert.equal(calculateRaidBossMaxHpForStrength(6, 2), 278);
  assert.equal(calculateRaidBossMaxHpForStrength(1, 7.59375), 911);
  assert.equal(
    calculateRaidBossMaxHpForStrength(
      1,
      calculateRaidParticipantStrength(0) + calculateRaidParticipantStrength(1),
    ),
    300,
  );
});

test("raid boss level roll is low-heavy and capped at level 50", () => {
  const levelOneBoss = createRaidBoss({
    random: () => 0,
  });
  const levelFiftyBoss = createRaidBoss({
    random: () => 0.999999,
  });
  const scaledBoss = createRaidBoss({
    random: () => 0,
    raiderStrength:
      calculateRaidParticipantStrength(0) +
      calculateRaidParticipantStrength(1) +
      calculateRaidParticipantStrength(2),
  });

  assert.equal(levelOneBoss.level, 1);
  assert.equal(levelOneBoss.maxHp, 120);
  assert.equal(levelFiftyBoss.level, 50);
  assert.equal(levelFiftyBoss.maxHp, 511);
  assert.equal(scaledBoss.maxHp, 570);
});

test("applied raid reward summaries reflect permanent pip bonus outcomes", () => {
  const reward = getDefaultRaidReward(12);

  assert.equal(
    describeAppliedRaidReward(reward, [12, 12]),
    "12 pips and x12 roll buff for the next 2 /rolls per eligible player",
  );
  assert.equal(
    describeAppliedRaidReward(reward, [12, 14]),
    "12-14 pips, based on permanent bonuses and x12 roll buff for the next 2 /rolls per eligible player",
  );
});
