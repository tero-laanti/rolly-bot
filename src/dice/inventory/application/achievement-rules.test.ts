import assert from "node:assert/strict";
import test from "node:test";
import { getDiceItemAchievementIds } from "./achievement-rules";

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
