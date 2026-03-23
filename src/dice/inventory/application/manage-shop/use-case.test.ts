import assert from "node:assert/strict";
import test from "node:test";
import type { DiceShopItem } from "../../domain/shop";
import { createDiceShopUseCase } from "./use-case";

const diceRevolver: DiceShopItem = {
  id: "dice-revolver",
  name: "Dice Revolver",
  description: "Your next 6 /roll uses roll twice.",
  pricePips: 6,
  consumable: true,
  effect: {
    type: "double-roll-uses",
    uses: 6,
  },
};

const cleanseSalt: DiceShopItem = {
  id: "cleanse-salt",
  name: "Cleanse Salt",
  description: "Removes all active negative effects and clears lockout.",
  pricePips: 15,
  consumable: true,
  effect: {
    type: "cleanse-all-negative-effects",
  },
};

const umbrellaHarness: DiceShopItem = {
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

const createTestShopUseCase = ({
  initialPips = 40,
  initialInventory = new Map<string, number>(),
  onRunInTransaction,
}: {
  initialPips?: number;
  initialInventory?: Map<string, number>;
  onRunInTransaction?: () => void;
} = {}) => {
  let pips = initialPips;
  const inventoryQuantities = new Map(initialInventory);
  let applyPipsDeltaCalls = 0;
  let grantInventoryItemCalls = 0;
  let recordShopPurchaseCalls = 0;

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
        const nextQuantity =
          itemId === umbrellaHarness.id
            ? 1
            : (inventoryQuantities.get(itemId) ?? 0) + Math.max(1, quantity);
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
      getDiceShopItem: (itemId) =>
        [diceRevolver, cleanseSalt, umbrellaHarness].find((item) => item.id === itemId) ?? null,
      getDiceShopItems: () => [diceRevolver, cleanseSalt, umbrellaHarness],
    },
    unitOfWork: {
      runInTransaction: (work) => {
        onRunInTransaction?.();
        return work();
      },
    },
  });

  return {
    useCase,
    inventoryQuantities,
    getPips: () => pips,
    getApplyPipsDeltaCalls: () => applyPipsDeltaCalls,
    getGrantInventoryItemCalls: () => grantInventoryItemCalls,
    getRecordShopPurchaseCalls: () => recordShopPurchaseCalls,
    setPips: (nextPips: number) => {
      pips = nextPips;
    },
  };
};

test("landing state builds correctly", () => {
  const { useCase } = createTestShopUseCase({ initialPips: 55 });

  const result = useCase.createDiceShopReply("user-1");

  assert.equal(result.kind, "reply");
  assert.equal(result.payload.type, "view");
  if (result.payload.type !== "view") {
    return;
  }

  assert.deepEqual(result.payload.view, {
    screen: "landing",
    ownerId: "user-1",
    balancePips: 55,
    statusMessage: undefined,
    categorySummaries: [
      {
        id: "consumables",
        label: "Consumables",
        summary: "Single-use items and timed boosts for your next moves.",
        itemCount: 2,
      },
      {
        id: "permanent-upgrades",
        label: "Permanent Upgrades",
        summary: "One-time passive upgrades that stay active once owned.",
        itemCount: 1,
      },
    ],
  });
});

test("category filtering splits consumables and permanent upgrades correctly", () => {
  const { useCase } = createTestShopUseCase();

  const consumables = useCase.handleDiceShopAction("user-1", {
    type: "open-category",
    ownerId: "user-1",
    categoryId: "consumables",
  });
  const upgrades = useCase.handleDiceShopAction("user-1", {
    type: "open-category",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
  });

  assert.equal(consumables.kind, "update");
  assert.equal(consumables.payload.type, "view");
  assert.equal(upgrades.kind, "update");
  assert.equal(upgrades.payload.type, "view");
  if (consumables.payload.type !== "view" || upgrades.payload.type !== "view") {
    return;
  }

  assert.equal(consumables.payload.view.screen, "category");
  assert.equal(upgrades.payload.view.screen, "category");
  if (
    consumables.payload.view.screen !== "category" ||
    upgrades.payload.view.screen !== "category"
  ) {
    return;
  }

  assert.deepEqual(
    consumables.payload.view.categoryItems.map((item) => item.id),
    [diceRevolver.id, cleanseSalt.id],
  );
  assert.deepEqual(
    upgrades.payload.view.categoryItems.map((item) => item.id),
    [umbrellaHarness.id],
  );
});

test("selecting an item returns the expected item-detail state", () => {
  const { useCase } = createTestShopUseCase();

  const result = useCase.handleDiceShopAction("user-1", {
    type: "select-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  if (result.payload.type !== "view") {
    return;
  }

  assert.equal(result.payload.view.screen, "item-detail");
  if (result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.deepEqual(result.payload.view.itemNavigation, {
    previousItemId: null,
    nextItemId: cleanseSalt.id,
  });
  assert.deepEqual(result.payload.view.selectedItem, {
    id: diceRevolver.id,
    name: "Dice Revolver",
    description: "Your next 6 /roll uses roll twice.",
    pricePips: 6,
    ownedQuantity: 0,
    typeLabel: "Consumable",
    buyable: true,
    buyDisabledReason: undefined,
  });
});

test("adjacent item navigation moves within the selected category order", () => {
  const { useCase } = createTestShopUseCase();

  const result = useCase.handleDiceShopAction("user-1", {
    type: "view-adjacent-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
    direction: "next",
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  if (result.payload.type !== "view") {
    return;
  }

  assert.equal(result.payload.view.screen, "item-detail");
  if (result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.equal(result.payload.view.selectedItem.id, cleanseSalt.id);
  assert.deepEqual(result.payload.view.itemNavigation, {
    previousItemId: diceRevolver.id,
    nextItemId: null,
  });
});

test("successful purchase returns a purchase receipt with the updated balance and quantity", () => {
  const { useCase, inventoryQuantities, getPips } = createTestShopUseCase({ initialPips: 40 });

  const result = useCase.handleDiceShopAction("user-1", {
    type: "buy-selected-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  if (result.payload.type !== "view") {
    return;
  }

  assert.equal(result.payload.view.screen, "purchase-receipt");
  if (result.payload.view.screen !== "purchase-receipt") {
    return;
  }

  assert.deepEqual(result.payload.view.receipt, {
    itemName: "Dice Revolver",
    ownedQuantity: 1,
    remainingPips: 34,
    changeSummary:
      "The item was added to your inventory. Use /inventory when you want to activate it.",
    statusText: undefined,
  });
  assert.equal(inventoryQuantities.get(diceRevolver.id), 1);
  assert.equal(getPips(), 34);
});

test("shop purchases re-check pip balance inside the transaction before charging pips", () => {
  const {
    useCase,
    getPips,
    getApplyPipsDeltaCalls,
    getGrantInventoryItemCalls,
    getRecordShopPurchaseCalls,
    setPips,
  } = createTestShopUseCase({
    initialPips: 40,
    onRunInTransaction: () => {
      setPips(10);
    },
  });

  const result = useCase.handleDiceShopAction("user-1", {
    type: "buy-selected-item",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
    itemId: umbrellaHarness.id,
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  if (result.payload.type !== "view") {
    return;
  }

  assert.equal(result.payload.view.screen, "item-detail");
  if (result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.equal(
    result.payload.view.statusMessage,
    `You need ${umbrellaHarness.pricePips} pips to buy ${umbrellaHarness.name}. Current balance: 10 pips.`,
  );
  assert.equal(result.payload.view.selectedItem.buyable, false);
  assert.equal(getPips(), 10);
  assert.equal(getApplyPipsDeltaCalls(), 0);
  assert.equal(getGrantInventoryItemCalls(), 0);
  assert.equal(getRecordShopPurchaseCalls(), 0);
});

test("permanent upgrades still reject repeat purchase", () => {
  const {
    useCase,
    getApplyPipsDeltaCalls,
    getGrantInventoryItemCalls,
    getRecordShopPurchaseCalls,
  } = createTestShopUseCase({
    initialPips: 40,
    initialInventory: new Map([[umbrellaHarness.id, 1]]),
  });

  const result = useCase.handleDiceShopAction("user-1", {
    type: "buy-selected-item",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
    itemId: umbrellaHarness.id,
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  if (result.payload.type !== "view") {
    return;
  }

  assert.equal(result.payload.view.screen, "item-detail");
  if (result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.equal(
    result.payload.view.statusMessage,
    `${umbrellaHarness.name} is already owned. Permanent upgrades can only be bought once.`,
  );
  assert.equal(result.payload.view.selectedItem.ownedQuantity, 1);
  assert.equal(result.payload.view.selectedItem.buyable, false);
  assert.equal(getApplyPipsDeltaCalls(), 0);
  assert.equal(getGrantInventoryItemCalls(), 0);
  assert.equal(getRecordShopPurchaseCalls(), 0);
});

test("close action clears interactivity", () => {
  const { useCase } = createTestShopUseCase();

  const result = useCase.handleDiceShopAction("user-1", {
    type: "close",
    ownerId: "user-1",
  });

  assert.deepEqual(result, {
    kind: "update",
    payload: {
      type: "message",
      content: "Shop closed.",
      clearComponents: true,
    },
  });
});
