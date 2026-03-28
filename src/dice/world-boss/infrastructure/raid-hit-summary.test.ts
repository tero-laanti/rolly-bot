import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldBossHitSummary } from "./raid-hit-summary";

test("World Boss hit summary includes the best set for multi-set rolls", () => {
  assert.equal(
    buildWorldBossHitSummary({
      damage: 29,
      bossName: "Bone Dragon",
      bestRollSet: [4, 2, 5, 6, 4, 8],
      defeated: false,
      currentHp: 71,
      maxHp: 100,
    }),
    "Best Roll: **4 • 2 • 5 • 6 • 4 • 8**\nYou dealt **29 World Boss damage.**\n**Bone Dragon** has 71/100 HP remaining.",
  );
});

test("World Boss hit summary omits the best set when there was only one roll set", () => {
  assert.equal(
    buildWorldBossHitSummary({
      damage: 29,
      bossName: "Bone Dragon",
      bestRollSet: null,
      defeated: true,
      rewardSummary: "5 Pips and 2 roll passes per eligible player",
      eligibleParticipantCount: 2,
    }),
    "You dealt **29 World Boss damage.**\n**Bone Dragon** was defeated. 2 eligible players earned 5 Pips and 2 roll passes per eligible player.",
  );
});

test("World Boss hit summary caps the best set preview for long multi-set rolls", () => {
  assert.equal(
    buildWorldBossHitSummary({
      damage: 29,
      bossName: "Bone Dragon",
      bestRollSet: Array.from({ length: 20 }, (_, index) => index + 1),
      defeated: false,
      currentHp: 71,
      maxHp: 100,
    }),
    "Best Roll: **1 • 2 • 3 • 4 • 5 • 6 • 7 • 8 • 9 • 10 • 11 • 12 • ... (+8 more)**\nYou dealt **29 World Boss damage.**\n**Bone Dragon** has 71/100 HP remaining.",
  );
});
