import assert from "node:assert/strict";
import test from "node:test";
import {
  getDiceGardenAchievementIds,
  getDiceItemAchievementIds,
  getDiceShopPurchaseAchievementIds,
} from "./achievement-rules";

test("item achievement rules award first purchase and usage markers", () => {
  const achievementIds = getDiceItemAchievementIds({
    shopPurchaseCount: 1,
    itemUseCount: 1,
    usedTriggerRandomGroupEvent: true,
    usedAutoRollItem: false,
    usedCleanseItem: true,
  });

  assert.deepEqual(achievementIds, [
    "shop-first-purchase",
    "item-first-use",
    "item-chaos-flare",
    "item-cleanse-salt",
  ]);
});

test("shop purchase rules award the Seed Satchel achievement", () => {
  assert.deepEqual(getDiceShopPurchaseAchievementIds("seed-satchel"), ["item-seed-satchel"]);
  assert.deepEqual(getDiceShopPurchaseAchievementIds("pip-magnet"), []);
});

test("garden achievement rules award planting and harvest milestones", () => {
  const achievementIds = getDiceGardenAchievementIds({
    plantedSeedCount: 1,
    harvestedSeedCount: 10,
    harvestedD12Count: 1,
  });

  assert.deepEqual(achievementIds, [
    "garden-first-plant",
    "garden-first-harvest",
    "garden-d12-harvest",
    "garden-ten-harvests",
  ]);
});
