import assert from "node:assert/strict";
import test from "node:test";
import { buildRaidHitSummary } from "./raid-hit-summary";

test("raid hit summary includes the best set for multi-set raid rolls", () => {
  assert.equal(
    buildRaidHitSummary({
      damage: 29,
      bossName: "Bone Dragon",
      bestRollSet: [4, 2, 5, 6, 4, 8],
      defeated: false,
      currentHp: 71,
      maxHp: 100,
    }),
    "Best Roll: **4 • 2 • 5 • 6 • 4 • 8**\nYou dealt **29 raid damage.**\n**Bone Dragon** has 71/100 HP remaining.",
  );
});

test("raid hit summary omits the best set when there was only one roll set", () => {
  assert.equal(
    buildRaidHitSummary({
      damage: 29,
      bossName: "Bone Dragon",
      bestRollSet: null,
      defeated: true,
      rewardSummary: "5 Pips and 2 roll passes per eligible raider",
      eligibleParticipantCount: 2,
    }),
    "You dealt **29 raid damage.**\n**Bone Dragon** was defeated. 2 eligible raiders earned 5 Pips and 2 roll passes per eligible raider.",
  );
});
