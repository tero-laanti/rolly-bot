import assert from "node:assert/strict";
import test from "node:test";
import { minuteMs } from "../../../shared/time";
import { getDiceShopItem } from "./shop";
import {
  applyPipRewardBonus,
  applyPvpLoserLockoutReduction,
  getBadLuckUmbrellaShieldMagnitude,
  getCleanseSaltShieldCharges,
  getDiceShopItemCurrentPricePips,
  getExtraBanSlots,
  getPermanentBonuses,
  getPersonalChargeBonus,
  itemRequiresOwnership,
} from "./passive-items";

test("passive inventory bonuses apply umbrella, cleanse, and PvP lockout reductions", () => {
  const ownedQuantities = new Map<string, number>([
    ["umbrella-harness", 1],
    ["clean-room-kit", 1],
    ["padded-bracers", 1],
  ]);

  assert.equal(getBadLuckUmbrellaShieldMagnitude(ownedQuantities), 2);
  assert.equal(getCleanseSaltShieldCharges(ownedQuantities), 1);
  assert.equal(applyPvpLoserLockoutReduction(60 * minuteMs, ownedQuantities), 51 * minuteMs);
});

test("padded bracers never reduce lockout below 15 minutes", () => {
  const ownedQuantities = new Map<string, number>([["padded-bracers", 1]]);

  assert.equal(applyPvpLoserLockoutReduction(10 * minuteMs, ownedQuantities), 15 * minuteMs);
});

test("repeatable passive upgrades stack ban slots and pip rewards", () => {
  const ownedQuantities = new Map<string, number>([
    ["blacklist-ledger", 3],
    ["pip-magnet", 2],
  ]);

  assert.equal(getExtraBanSlots(ownedQuantities), 3);
  assert.equal(applyPipRewardBonus(17, ownedQuantities), 20);
  assert.deepEqual(getPermanentBonuses(ownedQuantities), {
    extraBanSlots: 3,
    pipRewardBonusPercent: 20,
    personalCharge: {
      unlocked: false,
      minutesPerMultiplier: 0,
      speedMultiplier: 1,
      maxMultiplier: 1,
    },
  });
});

test("personal charge bonuses combine unlock speed and cap upgrades", () => {
  const ownedQuantities = new Map<string, number>([
    ["idle-dynamo", 1],
    ["starter-coil", 2],
    ["capacitor-bank", 3],
  ]);

  assert.deepEqual(getPersonalChargeBonus(ownedQuantities), {
    unlocked: true,
    minutesPerMultiplier: 2 / 1.5,
    speedMultiplier: 1.5,
    maxMultiplier: 40,
  });
});

test("repeatable upgrade pricing and prerequisites are derived from item data", () => {
  const pipMagnet = getDiceShopItem("pip-magnet");
  const starterCoil = getDiceShopItem("starter-coil");

  assert.ok(pipMagnet);
  assert.ok(starterCoil);
  if (!pipMagnet || !starterCoil) {
    return;
  }

  assert.equal(getDiceShopItemCurrentPricePips(pipMagnet, 0), 250);
  assert.equal(getDiceShopItemCurrentPricePips(pipMagnet, 3), 1_000);
  assert.equal(itemRequiresOwnership(starterCoil, new Map()), true);
  assert.equal(itemRequiresOwnership(starterCoil, new Map([["idle-dynamo", 1]])), false);
});
