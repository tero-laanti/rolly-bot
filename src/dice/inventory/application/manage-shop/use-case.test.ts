import assert from "node:assert/strict";
import test from "node:test";
import type { DiceShopItem } from "../../domain/shop";
import { createDiceShopUseCase } from "./use-case";

const passiveItem: DiceShopItem = {
  id: "umbrella-harness",
  name: "Umbrella Harness",
  description: "Adds one extra Bad Luck Umbrella charge.",
  pricePips: 25,
  consumable: false,
  effect: {
    type: "passive-extra-shield-on-umbrella",
    extraCharges: 1,
  },
};

const emptyItemAchievementStats = {
  shopPurchaseCount: 0,
  itemUseCount: 0,
  usedTriggerRandomGroupEvent: false,
  usedAutoRollItem: false,
  usedCleanseItem: false,
};

test("passive item purchases re-check ownership inside the transaction before charging pips", () => {
  let pips = 40;
  let applyPipsDeltaCalls = 0;
  let grantInventoryItemCalls = 0;
  let recordShopPurchaseCalls = 0;
  const inventoryQuantities = new Map<string, number>();

  const useCase = createDiceShopUseCase({
    economy: {
      getEconomySnapshot: () => ({ fame: 0, pips }),
      getPips: () => pips,
      applyPipsDelta: ({ amount }) => {
        applyPipsDeltaCalls += 1;
        pips += amount;
        return pips;
      },
    },
    inventory: {
      getInventoryQuantities: () => new Map(inventoryQuantities),
      grantInventoryItem: ({ itemId, quantity = 1 }) => {
        grantInventoryItemCalls += 1;
        const nextQuantity = Math.min(1, (inventoryQuantities.get(itemId) ?? 0) + quantity);
        inventoryQuantities.set(itemId, nextQuantity);
        return nextQuantity;
      },
      recordShopPurchase: () => {
        recordShopPurchaseCalls += 1;
        return emptyItemAchievementStats;
      },
    },
    progression: {
      awardAchievements: () => [],
    },
    shopCatalog: {
      getDiceShopItem: (itemId) => (itemId === passiveItem.id ? passiveItem : null),
      getDiceShopItems: () => [passiveItem],
    },
    unitOfWork: {
      runInTransaction: (work) => {
        inventoryQuantities.set(passiveItem.id, 1);
        return work();
      },
    },
  });

  const result = useCase.handleDiceShopAction("user-1", {
    type: "buy",
    ownerId: "user-1",
    itemId: passiveItem.id,
  });

  assert.deepEqual(result, {
    kind: "reply",
    payload: {
      type: "message",
      content: `${passiveItem.name} is already owned. Permanent passive upgrades can only be bought once.`,
      ephemeral: true,
    },
  });
  assert.equal(pips, 40);
  assert.equal(applyPipsDeltaCalls, 0);
  assert.equal(grantInventoryItemCalls, 0);
  assert.equal(recordShopPurchaseCalls, 0);
});

test("shop purchases re-check pip balance inside the transaction before charging pips", () => {
  let pips = 40;
  let applyPipsDeltaCalls = 0;
  let grantInventoryItemCalls = 0;
  const inventoryQuantities = new Map<string, number>();

  const useCase = createDiceShopUseCase({
    economy: {
      getEconomySnapshot: () => ({ fame: 0, pips }),
      getPips: () => pips,
      applyPipsDelta: ({ amount }) => {
        applyPipsDeltaCalls += 1;
        pips += amount;
        return pips;
      },
    },
    inventory: {
      getInventoryQuantities: () => new Map(inventoryQuantities),
      grantInventoryItem: ({ itemId, quantity = 1 }) => {
        grantInventoryItemCalls += 1;
        const nextQuantity = (inventoryQuantities.get(itemId) ?? 0) + quantity;
        inventoryQuantities.set(itemId, nextQuantity);
        return nextQuantity;
      },
      recordShopPurchase: () => emptyItemAchievementStats,
    },
    progression: {
      awardAchievements: () => [],
    },
    shopCatalog: {
      getDiceShopItem: (itemId) => (itemId === passiveItem.id ? passiveItem : null),
      getDiceShopItems: () => [passiveItem],
    },
    unitOfWork: {
      runInTransaction: (work) => {
        pips = 10;
        return work();
      },
    },
  });

  const result = useCase.handleDiceShopAction("user-1", {
    type: "buy",
    ownerId: "user-1",
    itemId: passiveItem.id,
  });

  assert.deepEqual(result, {
    kind: "reply",
    payload: {
      type: "message",
      content: `You need ${passiveItem.pricePips} pips to buy ${passiveItem.name}. Current balance: 10 pips.`,
      ephemeral: true,
    },
  });
  assert.equal(pips, 10);
  assert.equal(applyPipsDeltaCalls, 0);
  assert.equal(grantInventoryItemCalls, 0);
});
