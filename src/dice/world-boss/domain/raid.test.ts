import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWorldBossMaxHp,
  calculateWorldBossMaxHpForStrength,
  calculateWorldBossParticipantStrength,
  createWorldBoss,
  describeAppliedWorldBossReward,
  getDefaultWorldBossReward,
} from "./raid";

test("world boss pip reward formula stays flat through level 5 and scales from level 6", () => {
  assert.equal(getDefaultWorldBossReward(1).pips, 5);
  assert.equal(getDefaultWorldBossReward(5).pips, 5);
  assert.equal(getDefaultWorldBossReward(6).pips, 6);
  assert.equal(getDefaultWorldBossReward(35).pips, 35);
});

test("world boss hp scales by 3 percent per boss level", () => {
  assert.equal(calculateWorldBossMaxHp(1), 120);
  assert.equal(calculateWorldBossMaxHp(30), 283);
  assert.equal(calculateWorldBossMaxHp(50), 511);
});

test("world boss prestige strength uses the configured prestige multiplier", () => {
  assert.equal(calculateWorldBossParticipantStrength(0), 1);
  assert.equal(calculateWorldBossParticipantStrength(1), 1.5);
  assert.equal(calculateWorldBossParticipantStrength(2), 2.25);
  assert.equal(calculateWorldBossParticipantStrength(3), 3.375);
  assert.equal(calculateWorldBossParticipantStrength(4), 5.0625);
  assert.equal(calculateWorldBossParticipantStrength(5), 7.59375);
  assert.equal(calculateWorldBossParticipantStrength(8), 25.62890625);
});

test("world boss hp scales by summed player strength without a cap", () => {
  assert.equal(calculateWorldBossMaxHpForStrength(6, 1), 139);
  assert.equal(calculateWorldBossMaxHpForStrength(6, 2), 278);
  assert.equal(calculateWorldBossMaxHpForStrength(1, 7.59375), 911);
  assert.equal(
    calculateWorldBossMaxHpForStrength(
      1,
      calculateWorldBossParticipantStrength(0) + calculateWorldBossParticipantStrength(1),
    ),
    300,
  );
});

test("world boss level roll is low-heavy and capped at level 50", () => {
  const levelOneBoss = createWorldBoss({
    random: () => 0,
  });
  const levelFiftyBoss = createWorldBoss({
    random: () => 0.999999,
  });
  const scaledBoss = createWorldBoss({
    random: () => 0,
    raiderStrength:
      calculateWorldBossParticipantStrength(0) +
      calculateWorldBossParticipantStrength(1) +
      calculateWorldBossParticipantStrength(2),
  });

  assert.equal(levelOneBoss.level, 1);
  assert.equal(levelOneBoss.maxHp, 120);
  assert.equal(levelFiftyBoss.level, 50);
  assert.equal(levelFiftyBoss.maxHp, 511);
  assert.equal(scaledBoss.maxHp, 570);
});

test("applied world boss reward summaries reflect permanent pip bonus outcomes", () => {
  const reward = getDefaultWorldBossReward(12);

  assert.equal(
    describeAppliedWorldBossReward(reward, [12, 12]),
    "12 pips and x12 roll buff for the next 2 /rolls per eligible player",
  );
  assert.equal(
    describeAppliedWorldBossReward(reward, [12, 14]),
    "12-14 pips, based on permanent bonuses and x12 roll buff for the next 2 /rolls per eligible player",
  );
});
