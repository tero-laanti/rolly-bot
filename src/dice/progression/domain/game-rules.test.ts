import assert from "node:assert/strict";
import test from "node:test";
import {
  getDicePvpDieSidesForTier,
  getDiceSidesForPrestige,
  getDuelPunishmentMs,
  getMaxDicePrestige,
  getMaxDicePvpTier,
  getUnlockedDicePvpTierFromPrestige,
} from "./game-rules";

const hourMs = 60 * 60 * 1000;
const minuteMs = 60 * 1000;

test("dice prestige uses the smooth +2 side progression up to prestige 15", () => {
  assert.equal(getMaxDicePrestige(), 15);
  assert.equal(getDiceSidesForPrestige(0), 6);
  assert.equal(getDiceSidesForPrestige(1), 8);
  assert.equal(getDiceSidesForPrestige(4), 14);
  assert.equal(getDiceSidesForPrestige(5), 16);
  assert.equal(getDiceSidesForPrestige(15), 36);
  assert.equal(getDiceSidesForPrestige(99), 36);
});

test("pvp tier progression is capped at tier 5 and d14", () => {
  assert.equal(getMaxDicePvpTier(), 5);
  assert.equal(getUnlockedDicePvpTierFromPrestige(0), 1);
  assert.equal(getUnlockedDicePvpTierFromPrestige(3), 4);
  assert.equal(getUnlockedDicePvpTierFromPrestige(4), 5);
  assert.equal(getUnlockedDicePvpTierFromPrestige(15), 5);
  assert.equal(getDicePvpDieSidesForTier(5), 14);
  assert.equal(getDicePvpDieSidesForTier(99), 14);
});

test("pvp punishment duration is capped by the max tier clamp", () => {
  assert.equal(getDuelPunishmentMs(5), 8 * hourMs);
  assert.equal(getDuelPunishmentMs(99), 8 * hourMs);
  assert.equal(getDuelPunishmentMs(1), 30 * minuteMs);
});
