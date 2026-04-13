import assert from "node:assert/strict";
import test from "node:test";
import type { DiceShopItem } from "../../domain/shop";
import { createDiceShopUseCase } from "./use-case";
import type { UseDiceItemResult } from "../use-item/use-case";

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
  description: "Doubles Bad Luck Umbrella effectiveness, so lockouts lose 2 hours instead of 1.",
  pricePips: 25,
  consumable: false,
  effect: {
    type: "passive-extra-shield-on-umbrella",
    extraCharges: 1,
  },
};

const idleDynamo: DiceShopItem = {
  id: "idle-dynamo",
  name: "Idle Dynamo",
  description:
    "Passive upgrade: unlocks personal Dice charge at +1 every 2 idle minutes, up to x10.",
  pricePips: 50,
  consumable: false,
  effect: {
    type: "passive-personal-charge-unlock",
    minutesPerMultiplier: 2,
    maxMultiplier: 10,
  },
};

const starterCoil: DiceShopItem = {
  id: "starter-coil",
  name: "Starter Coil",
  description: "Passive upgrade: each copy makes personal Dice charge build 25% faster.",
  pricePips: 300,
  consumable: false,
  repeatablePricing: {
    priceIncreasePipsPerOwned: 300,
  },
  requiresItemId: "idle-dynamo",
  effect: {
    type: "passive-personal-charge-speed-bonus",
    fasterPercent: 0.25,
  },
};

const capacitorBank: DiceShopItem = {
  id: "capacitor-bank",
  name: "Capacitor Bank",
  description: "Passive upgrade: each copy raises personal Dice charge max by +10.",
  pricePips: 300,
  consumable: false,
  repeatablePricing: {
    priceIncreasePipsPerOwned: 300,
  },
  requiresItemId: "idle-dynamo",
  effect: {
    type: "passive-personal-charge-cap-bonus",
    extraMaxMultiplier: 10,
  },
};

const emptyItemAchievementStats = {
  shopPurchaseCount: 0,
  itemUseCount: 0,
  usedTriggerRandomGroupEvent: false,
  usedAutoRollItem: false,
  usedCleanseItem: false,
};

const defaultShopItems = [diceRevolver, cleanseSalt, umbrellaHarness];

const createTestShopUseCase = ({
  initialPips = 40,
  initialInventory = new Map<string, number>(),
  catalogItems = defaultShopItems,
  onRunInTransaction,
  onUseDiceItem,
}: {
  initialPips?: number;
  initialInventory?: Map<string, number>;
  catalogItems?: DiceShopItem[];
  onRunInTransaction?: () => void;
  onUseDiceItem?: (input: { userId: string; itemId: string }) => Promise<UseDiceItemResult>;
} = {}) => {
  let pips = initialPips;
  const inventoryQuantities = new Map(initialInventory);
  let applyPipsDeltaCalls = 0;
  let grantInventoryItemCalls = 0;
  let recordShopPurchaseCalls = 0;
  const useDiceItemCalls: string[] = [];
  const shopCatalog = {
    getDiceShopItem: (itemId: string) => catalogItems.find((item) => item.id === itemId) ?? null,
    getDiceShopItems: () => catalogItems,
  };

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
    shopCatalog,
    unitOfWork: {
      runInTransaction: (work) => {
        onRunInTransaction?.();
        return work();
      },
    },
    useDiceItem: async ({ userId, itemId }) => {
      useDiceItemCalls.push(itemId);

      if (onUseDiceItem) {
        return onUseDiceItem({ userId, itemId });
      }

      const item = shopCatalog.getDiceShopItem(itemId);
      if (!item) {
        return {
          ok: false,
          message: "That inventory item does not exist.",
        };
      }

      if (!item.consumable) {
        return {
          ok: false,
          message: `${item.name} cannot be consumed.`,
        };
      }

      const ownedQuantity = inventoryQuantities.get(itemId) ?? 0;
      if (ownedQuantity < 1) {
        return {
          ok: false,
          message: `You do not have any ${item.name} to use.`,
        };
      }

      inventoryQuantities.set(itemId, ownedQuantity - 1);
      return {
        ok: true,
        item,
        remainingQuantity: ownedQuantity - 1,
        statusMessage: `${item.name} used.`,
      };
    },
  });

  return {
    useCase,
    inventoryQuantities,
    getPips: () => pips,
    getApplyPipsDeltaCalls: () => applyPipsDeltaCalls,
    getGrantInventoryItemCalls: () => grantInventoryItemCalls,
    getRecordShopPurchaseCalls: () => recordShopPurchaseCalls,
    getUseDiceItemCalls: () => [...useDiceItemCalls],
    setPips: (nextPips: number) => {
      pips = nextPips;
    },
    handleAction: (
      action: Parameters<typeof useCase.handleDiceShopAction>[1],
      actorId = "user-1",
    ) =>
      useCase.handleDiceShopAction(actorId, action, {
        reserveAutoRollSession: () => null,
        triggerRandomGroupEvent: async () => ({
          ok: false,
          reason: "unavailable",
        }),
      }),
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
        summary: "Passive upgrades and permanent systems that stay active once bought.",
        itemCount: 1,
      },
    ],
  });
});

test("category filtering splits consumables and permanent upgrades correctly", async () => {
  const { handleAction } = createTestShopUseCase();

  const consumables = await handleAction({
    type: "open-category",
    ownerId: "user-1",
    categoryId: "consumables",
  });
  const upgrades = await handleAction({
    type: "open-category",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
  });

  assert.equal(consumables.result.kind, "update");
  assert.equal(consumables.result.payload.type, "view");
  assert.equal(upgrades.result.kind, "update");
  assert.equal(upgrades.result.payload.type, "view");
  if (consumables.result.payload.type !== "view" || upgrades.result.payload.type !== "view") {
    return;
  }

  assert.equal(consumables.result.payload.view.screen, "category");
  assert.equal(upgrades.result.payload.view.screen, "category");
  if (
    consumables.result.payload.view.screen !== "category" ||
    upgrades.result.payload.view.screen !== "category"
  ) {
    return;
  }

  assert.deepEqual(
    consumables.result.payload.view.categoryItems.map((item) => item.id),
    [diceRevolver.id, cleanseSalt.id],
  );
  assert.equal(consumables.result.payload.view.currentPage, 0);
  assert.equal(consumables.result.payload.view.totalPages, 1);
  assert.deepEqual(
    upgrades.result.payload.view.categoryItems.map((item) => item.id),
    [umbrellaHarness.id],
  );
  assert.equal(upgrades.result.payload.view.currentPage, 0);
  assert.equal(upgrades.result.payload.view.totalPages, 1);
});

test("selecting an item returns the expected item-detail state", async () => {
  const { handleAction } = createTestShopUseCase();

  const result = await handleAction({
    type: "select-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
  });

  assert.equal(result.result.kind, "update");
  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "item-detail");
  if (result.result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.deepEqual(result.result.payload.view.itemNavigation, {
    previousItemId: null,
    nextItemId: cleanseSalt.id,
  });
  assert.deepEqual(result.result.payload.view.selectedItem, {
    id: diceRevolver.id,
    name: "Dice Revolver",
    description: "Your next 6 /roll uses roll twice.",
    pricePips: 6,
    nextPricePips: undefined,
    ownedQuantity: 0,
    ownedLabel: "Owned 0",
    typeLabel: "Consumable",
    buyable: true,
    buyDisabledReason: undefined,
  });
  assert.equal(result.result.payload.view.categoryPage, 0);
  assert.equal(result.result.payload.view.categoryTotalPages, 1);
});

test("adjacent item navigation moves within the selected category order", async () => {
  const { handleAction } = createTestShopUseCase();

  const result = await handleAction({
    type: "view-adjacent-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
    direction: "next",
  });

  assert.equal(result.result.kind, "update");
  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "item-detail");
  if (result.result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.equal(result.result.payload.view.selectedItem.id, cleanseSalt.id);
  assert.equal(result.result.payload.view.categoryPage, 0);
  assert.equal(result.result.payload.view.categoryTotalPages, 1);
  assert.deepEqual(result.result.payload.view.itemNavigation, {
    previousItemId: diceRevolver.id,
    nextItemId: null,
  });
});

test("successful purchase returns a purchase receipt with the updated balance and quantity", async () => {
  const { handleAction, inventoryQuantities, getPips } = createTestShopUseCase({ initialPips: 40 });

  const result = await handleAction({
    type: "buy-selected-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
  });

  assert.equal(result.result.kind, "update");
  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "purchase-receipt");
  if (result.result.payload.view.screen !== "purchase-receipt") {
    return;
  }

  assert.deepEqual(result.result.payload.view.receipt, {
    itemId: diceRevolver.id,
    categoryId: "consumables",
    itemName: "Dice Revolver",
    boughtAnother: false,
    ownedQuantity: 1,
    remainingPips: 34,
    changeSummary:
      "The item was added to your inventory. Use /inventory when you want to activate it.",
    canUseItemNow: true,
  });
  assert.equal(inventoryQuantities.get(diceRevolver.id), 1);
  assert.equal(getPips(), 34);
});

test("shop purchases re-check pip balance inside the transaction before charging pips", async () => {
  const {
    handleAction,
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

  const result = await handleAction({
    type: "buy-selected-item",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
    itemId: umbrellaHarness.id,
  });

  assert.equal(result.result.kind, "update");
  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "item-detail");
  if (result.result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.equal(
    result.result.payload.view.statusMessage,
    `You need ${umbrellaHarness.pricePips} pips to buy ${umbrellaHarness.name}. Current balance: 10 pips.`,
  );
  assert.equal(result.result.payload.view.selectedItem.buyable, false);
  assert.equal(getPips(), 10);
  assert.equal(getApplyPipsDeltaCalls(), 0);
  assert.equal(getGrantInventoryItemCalls(), 0);
  assert.equal(getRecordShopPurchaseCalls(), 0);
});

test("permanent upgrades still reject repeat purchase", async () => {
  const {
    handleAction,
    getApplyPipsDeltaCalls,
    getGrantInventoryItemCalls,
    getRecordShopPurchaseCalls,
  } = createTestShopUseCase({
    initialPips: 40,
    initialInventory: new Map([[umbrellaHarness.id, 1]]),
  });

  const result = await handleAction({
    type: "buy-selected-item",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
    itemId: umbrellaHarness.id,
  });

  assert.equal(result.result.kind, "update");
  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "item-detail");
  if (result.result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.equal(
    result.result.payload.view.statusMessage,
    `${umbrellaHarness.name} is already owned. Permanent upgrades can only be bought once.`,
  );
  assert.equal(result.result.payload.view.selectedItem.ownedQuantity, 1);
  assert.equal(result.result.payload.view.selectedItem.buyable, false);
  assert.equal(getApplyPipsDeltaCalls(), 0);
  assert.equal(getGrantInventoryItemCalls(), 0);
  assert.equal(getRecordShopPurchaseCalls(), 0);
});

test("buy another immediately repurchases the same item and marks the receipt as a repeat buy", async () => {
  const { handleAction, inventoryQuantities, getPips } = createTestShopUseCase({ initialPips: 40 });

  await handleAction({
    type: "buy-selected-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
  });

  const result = await handleAction({
    type: "buy-another-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
  });

  assert.equal(result.result.kind, "update");
  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "purchase-receipt");
  if (result.result.payload.view.screen !== "purchase-receipt") {
    return;
  }

  assert.deepEqual(result.result.payload.view.receipt, {
    itemId: diceRevolver.id,
    categoryId: "consumables",
    itemName: "Dice Revolver",
    boughtAnother: true,
    ownedQuantity: 2,
    remainingPips: 28,
    changeSummary:
      "The item was added to your inventory. Use /inventory when you want to activate it.",
    canUseItemNow: true,
  });
  assert.equal(inventoryQuantities.get(diceRevolver.id), 2);
  assert.equal(getPips(), 28);
});

test("buying a hidden prerequisite-gated upgrade is rejected as unavailable", async () => {
  const { handleAction } = createTestShopUseCase({
    initialPips: 1_000,
    catalogItems: [idleDynamo, starterCoil, capacitorBank],
  });

  const result = await handleAction({
    type: "buy-selected-item",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
    itemId: starterCoil.id,
  });

  assert.deepEqual(result.result, {
    kind: "reply",
    payload: {
      type: "message",
      content: "That shop item does not exist.",
      ephemeral: true,
    },
  });
});

test("prerequisite-gated permanent upgrades stay hidden from the shop until unlocked", async () => {
  const { useCase, handleAction } = createTestShopUseCase({
    initialPips: 1_000,
    catalogItems: [idleDynamo, starterCoil, capacitorBank],
  });

  const landing = useCase.createDiceShopReply("user-1");
  const category = await handleAction({
    type: "open-category",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
  });

  assert.equal(landing.payload.type, "view");
  assert.equal(category.result.payload.type, "view");
  if (landing.payload.type !== "view" || category.result.payload.type !== "view") {
    return;
  }

  assert.deepEqual(landing.payload.view.categorySummaries, [
    {
      id: "consumables",
      label: "Consumables",
      summary: "Single-use items and timed boosts for your next moves.",
      itemCount: 0,
    },
    {
      id: "permanent-upgrades",
      label: "Permanent Upgrades",
      summary: "Passive upgrades and permanent systems that stay active once bought.",
      itemCount: 1,
    },
  ]);
  assert.equal(category.result.payload.view.screen, "category");
  if (category.result.payload.view.screen !== "category") {
    return;
  }

  assert.deepEqual(
    category.result.payload.view.categoryItems.map((item) => item.id),
    [idleDynamo.id],
  );
});

test("prerequisite-gated permanent upgrades appear once the required item is owned", async () => {
  const { handleAction } = createTestShopUseCase({
    initialPips: 1_000,
    initialInventory: new Map([[idleDynamo.id, 1]]),
    catalogItems: [idleDynamo, starterCoil, capacitorBank],
  });

  const category = await handleAction({
    type: "open-category",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
  });
  const detail = await handleAction({
    type: "select-item",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
    itemId: starterCoil.id,
  });

  assert.equal(category.result.payload.type, "view");
  assert.equal(detail.result.payload.type, "view");
  if (category.result.payload.type !== "view" || detail.result.payload.type !== "view") {
    return;
  }

  assert.equal(category.result.payload.view.screen, "category");
  assert.equal(detail.result.payload.view.screen, "item-detail");
  if (
    category.result.payload.view.screen !== "category" ||
    detail.result.payload.view.screen !== "item-detail"
  ) {
    return;
  }

  assert.deepEqual(
    category.result.payload.view.categoryItems.map((item) => item.id),
    [idleDynamo.id, starterCoil.id, capacitorBank.id],
  );
  assert.deepEqual(detail.result.payload.view.itemNavigation, {
    previousItemId: idleDynamo.id,
    nextItemId: capacitorBank.id,
  });
});

test("direct selection of a hidden prerequisite-gated item is rejected", async () => {
  const { handleAction } = createTestShopUseCase({
    initialPips: 1_000,
    catalogItems: [idleDynamo, starterCoil, capacitorBank],
  });

  const result = await handleAction({
    type: "select-item",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
    itemId: starterCoil.id,
  });

  assert.deepEqual(result.result, {
    kind: "reply",
    payload: {
      type: "message",
      content: "That shop item does not exist.",
      ephemeral: true,
    },
  });
});

test("use item prompt opens a yes/no confirmation screen", async () => {
  const { handleAction } = createTestShopUseCase();

  const result = await handleAction({
    type: "prompt-use-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
  });

  assert.equal(result.result.kind, "update");
  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.deepEqual(result.result.payload.view, {
    screen: "use-item-confirmation",
    ownerId: "user-1",
    balancePips: 40,
    categorySummaries: categorySummariesFromTestCatalog(),
    categoryId: "consumables",
    itemId: diceRevolver.id,
    itemName: "Dice Revolver",
  });
});

test("category paging splits once a category grows beyond Discord's select option limit", async () => {
  const catalogItems: DiceShopItem[] = Array.from({ length: 26 }, (_, index) => ({
    id: `consumable-${index + 1}`,
    name: `Consumable ${index + 1}`,
    description: `Consumable ${index + 1} description.`,
    pricePips: index + 1,
    consumable: true,
    effect: {
      type: "double-roll-uses",
      uses: index + 1,
    },
  }));
  const { handleAction } = createTestShopUseCase({ catalogItems });

  const firstPage = await handleAction({
    type: "open-category",
    ownerId: "user-1",
    categoryId: "consumables",
  });
  const secondPage = await handleAction({
    type: "page-category",
    ownerId: "user-1",
    categoryId: "consumables",
    page: 1,
  });

  assert.equal(firstPage.result.payload.type, "view");
  assert.equal(secondPage.result.payload.type, "view");
  if (firstPage.result.payload.type !== "view" || secondPage.result.payload.type !== "view") {
    return;
  }

  assert.equal(firstPage.result.payload.view.screen, "category");
  assert.equal(secondPage.result.payload.view.screen, "category");
  if (
    firstPage.result.payload.view.screen !== "category" ||
    secondPage.result.payload.view.screen !== "category"
  ) {
    return;
  }

  assert.equal(firstPage.result.payload.view.currentPage, 0);
  assert.equal(firstPage.result.payload.view.totalPages, 2);
  assert.equal(firstPage.result.payload.view.categoryItems.length, 25);
  assert.equal(secondPage.result.payload.view.currentPage, 1);
  assert.equal(secondPage.result.payload.view.totalPages, 2);
  assert.deepEqual(
    secondPage.result.payload.view.categoryItems.map((item) => item.id),
    ["consumable-26"],
  );
});

test("category paging also splits before field overflow when item summaries are long", async () => {
  const catalogItems: DiceShopItem[] = Array.from({ length: 12 }, (_, index) => ({
    id: `upgrade-${index + 1}`,
    name: `Upgrade ${index + 1} ${"X".repeat(65)}`,
    description: `Permanent upgrade ${index + 1}.`,
    pricePips: 100 + index,
    consumable: false,
    effect: {
      type: "passive-extra-shield-on-umbrella",
      extraCharges: 1,
    },
  }));
  const { handleAction } = createTestShopUseCase({ catalogItems });

  const result = await handleAction({
    type: "open-category",
    ownerId: "user-1",
    categoryId: "permanent-upgrades",
  });

  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "category");
  if (result.result.payload.view.screen !== "category") {
    return;
  }

  assert.equal(result.result.payload.view.totalPages > 1, true);
});

test("item detail tracks the category page that contains the selected item", async () => {
  const catalogItems: DiceShopItem[] = Array.from({ length: 26 }, (_, index) => ({
    id: `consumable-${index + 1}`,
    name: `Consumable ${index + 1}`,
    description: `Consumable ${index + 1} description.`,
    pricePips: index + 1,
    consumable: true,
    effect: {
      type: "double-roll-uses",
      uses: index + 1,
    },
  }));
  const { handleAction } = createTestShopUseCase({ catalogItems });

  const result = await handleAction({
    type: "select-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: "consumable-26",
  });

  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "item-detail");
  if (result.result.payload.view.screen !== "item-detail") {
    return;
  }

  assert.equal(result.result.payload.view.categoryPage, 1);
  assert.equal(result.result.payload.view.categoryTotalPages, 2);
});

test("confirming use item applies the item and returns to the shop lobby", async () => {
  const { handleAction, inventoryQuantities, getUseDiceItemCalls } = createTestShopUseCase({
    initialInventory: new Map([[diceRevolver.id, 1]]),
  });

  const result = await handleAction({
    type: "confirm-use-item",
    ownerId: "user-1",
    categoryId: "consumables",
    itemId: diceRevolver.id,
  });

  assert.deepEqual(getUseDiceItemCalls(), [diceRevolver.id]);
  assert.equal(inventoryQuantities.get(diceRevolver.id), 0);
  assert.equal(result.result.kind, "update");
  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.equal(result.result.payload.view.screen, "landing");
  if (result.result.payload.view.screen !== "landing") {
    return;
  }

  assert.equal(result.result.payload.view.statusMessage, "Dice Revolver used.");
});

test("close action clears interactivity", async () => {
  const { handleAction } = createTestShopUseCase();

  const result = await handleAction({
    type: "close",
    ownerId: "user-1",
  });

  assert.deepEqual(result.result, {
    kind: "update",
    payload: {
      type: "message",
      content: "Shop closed.",
      clearComponents: true,
    },
  });
});

const categorySummariesFromTestCatalog = () => [
  {
    id: "consumables" as const,
    label: "Consumables",
    summary: "Single-use items and timed boosts for your next moves.",
    itemCount: 2,
  },
  {
    id: "permanent-upgrades" as const,
    label: "Permanent Upgrades",
    summary: "Passive upgrades and permanent systems that stay active once bought.",
    itemCount: 1,
  },
];
