import assert from "node:assert/strict";
import test from "node:test";
import type { DiceShopItem } from "../../domain/shop";
import type { DiceItemEffectsService } from "../item-effects-service";
import { createFinalizeAutoRollItemUseUseCase, createUseDiceItemUseCase } from "./use-case";

const autoRollItem: DiceShopItem = {
  id: "clockwork-croupier",
  name: "Clockwork Croupier",
  description: "Starts an auto-roll session.",
  pricePips: 100,
  consumable: true,
  effect: {
    type: "auto-roll-session",
    durationSeconds: 60,
    intervalSeconds: 5,
  },
};

const umbrellaItem: DiceShopItem = {
  id: "bad-luck-umbrella",
  name: "Bad Luck Umbrella",
  description: "Blocks the next negative effect.",
  pricePips: 8,
  consumable: true,
  effect: {
    type: "negative-effect-shield",
    charges: 1,
  },
};

const revolverItem: DiceShopItem = {
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

const longburnSpringItem: DiceShopItem = {
  id: "longburn-spring",
  name: "Longburn Spring",
  description: "Your /roll uses roll twice for 5 minutes.",
  pricePips: 12,
  consumable: true,
  effect: {
    type: "double-roll-duration",
    minutes: 5,
  },
};

const cleanseSaltItem: DiceShopItem = {
  id: "cleanse-salt",
  name: "Cleanse Salt",
  description: "Clears active negative effects.",
  pricePips: 15,
  consumable: true,
  effect: {
    type: "cleanse-all-negative-effects",
  },
};

const createItemEffectsStub = (): DiceItemEffectsService => ({
  getItemDoubleRollStatus: () => ({
    isActive: false,
    remainingUses: 0,
    expiresAtMs: null,
  }),
  consumeOneDoubleRollUse: () => false,
  grantNegativeEffectShield: () => undefined,
  grantDoubleRollUses: () => undefined,
  grantDoubleRollDuration: () => undefined,
  clearAllNegativeTemporaryEffects: () => 0,
});

test("auto-roll item use defers achievement writes until startup is finalized", async () => {
  let recordItemUseCalls = 0;
  let awardAchievementCalls = 0;
  const reservation = {
    id: "reservation-1",
    userId: "user-1",
    itemName: autoRollItem.name,
    durationSeconds: 60,
    intervalSeconds: 5,
    totalRolls: 12,
  };

  const useDiceItem = createUseDiceItemUseCase({
    inventory: {
      getInventoryQuantities: () => new Map(),
      getInventoryQuantity: () => 1,
      consumeInventoryItem: () => ({
        ok: true,
        item: autoRollItem,
        remainingQuantity: 0,
      }),
      grantInventoryItem: () => 1,
      recordItemUse: () => {
        recordItemUseCalls += 1;
        return {
          shopPurchaseCount: 0,
          itemUseCount: 1,
          usedTriggerRandomGroupEvent: false,
          usedAutoRollItem: true,
          usedCleanseItem: false,
        };
      },
    },
    itemEffects: createItemEffectsStub(),
    pvp: {
      getActiveDiceLockout: () => null,
      setDicePvpEffects: () => undefined,
    },
    progression: {
      awardAchievements: () => {
        awardAchievementCalls += 1;
        return [];
      },
    },
    shopCatalog: {
      getDiceShopItem: () => autoRollItem,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = await useDiceItem({
    userId: "user-1",
    itemId: autoRollItem.id,
    reserveAutoRollSession: () => reservation,
    triggerRandomGroupEvent: async () => ({ ok: false, reason: "disabled" }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.statusMessage, "Clockwork Croupier engaged.");
  assert.deepEqual(result.achievementAnnouncements, undefined);
  assert.deepEqual(result.autoRollReservation, reservation);
  assert.equal(recordItemUseCalls, 0);
  assert.equal(awardAchievementCalls, 0);
});

test("finalizing auto-roll item use records item-use progress inside a transaction", () => {
  const calls: string[] = [];

  const finalizeAutoRollItemUse = createFinalizeAutoRollItemUseUseCase({
    inventory: {
      consumeInventoryItem: () => ({
        ok: true,
        item: autoRollItem,
        remainingQuantity: 0,
      }),
      getInventoryQuantities: () => new Map(),
      getInventoryQuantity: () => 1,
      grantInventoryItem: () => 1,
      recordItemUse: ({ userId, itemId }) => {
        calls.push(`record:${userId}:${itemId}`);
        return {
          shopPurchaseCount: 0,
          itemUseCount: 1,
          usedTriggerRandomGroupEvent: false,
          usedAutoRollItem: true,
          usedCleanseItem: false,
        };
      },
    },
    progression: {
      awardAchievements: () => {
        calls.push("award");
        return [];
      },
    },
    unitOfWork: {
      runInTransaction: (work) => {
        calls.push("transaction");
        return work();
      },
    },
  });

  const result = finalizeAutoRollItemUse({
    userId: "user-1",
    itemId: autoRollItem.id,
  });

  assert.deepEqual(calls, ["transaction", `record:user-1:${autoRollItem.id}`]);
  assert.deepEqual(result.achievementAnnouncements, []);
});

test("umbrella harness doubles Bad Luck Umbrella lockout strength", async () => {
  const grantedShields: Array<{ charges?: number; magnitude?: number }> = [];
  const useDiceItem = createUseDiceItemUseCase({
    inventory: {
      consumeInventoryItem: () => ({
        ok: true,
        item: umbrellaItem,
        remainingQuantity: 0,
      }),
      getInventoryQuantities: () => new Map([["umbrella-harness", 1]]),
      getInventoryQuantity: () => 1,
      grantInventoryItem: () => 1,
      recordItemUse: () => ({
        shopPurchaseCount: 0,
        itemUseCount: 1,
        usedTriggerRandomGroupEvent: false,
        usedAutoRollItem: false,
        usedCleanseItem: false,
      }),
    },
    itemEffects: {
      ...createItemEffectsStub(),
      grantNegativeEffectShield: ({ charges = 1, magnitude = 1 }) => {
        grantedShields.push({ charges, magnitude });
      },
    },
    pvp: {
      getActiveDiceLockout: () => null,
      setDicePvpEffects: () => undefined,
    },
    progression: {
      awardAchievements: () => [],
    },
    shopCatalog: {
      getDiceShopItem: () => umbrellaItem,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = await useDiceItem({
    userId: "user-1",
    itemId: umbrellaItem.id,
    reserveAutoRollSession: () => null,
    triggerRandomGroupEvent: async () => ({ ok: false, reason: "disabled" }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(grantedShields, [{ charges: 1, magnitude: 2 }]);
  if (result.ok) {
    assert.match(result.statusMessage, /lockouts lose up to 2 hours/);
  }
});

test("clean room kit grants a Bad Luck Umbrella charge when using Cleanse Salt", async () => {
  const grantedCharges: number[] = [];
  const useDiceItem = createUseDiceItemUseCase({
    inventory: {
      consumeInventoryItem: () => ({
        ok: true,
        item: cleanseSaltItem,
        remainingQuantity: 0,
      }),
      getInventoryQuantities: () => new Map([["clean-room-kit", 1]]),
      getInventoryQuantity: () => 1,
      grantInventoryItem: () => 1,
      recordItemUse: () => ({
        shopPurchaseCount: 0,
        itemUseCount: 1,
        usedTriggerRandomGroupEvent: false,
        usedAutoRollItem: false,
        usedCleanseItem: true,
      }),
    },
    itemEffects: {
      ...createItemEffectsStub(),
      grantNegativeEffectShield: ({ charges = 1 }) => {
        grantedCharges.push(charges);
      },
      clearAllNegativeTemporaryEffects: () => 1,
    },
    pvp: {
      getActiveDiceLockout: () => null,
      setDicePvpEffects: () => undefined,
    },
    progression: {
      awardAchievements: () => [],
    },
    shopCatalog: {
      getDiceShopItem: () => cleanseSaltItem,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = await useDiceItem({
    userId: "user-1",
    itemId: cleanseSaltItem.id,
    reserveAutoRollSession: () => null,
    triggerRandomGroupEvent: async () => ({ ok: false, reason: "disabled" }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(grantedCharges, [1]);
  if (result.ok) {
    assert.match(result.statusMessage, /Clean Room Kit also granted 1 Bad Luck Umbrella charge/);
  }
});

test("Cleanse Salt shaves one hour off an active lockout", async () => {
  const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const originalDateNow = Date.now;
  Date.now = () => nowMs;

  let nextLockoutUntil: string | null | undefined;

  try {
    const useDiceItem = createUseDiceItemUseCase({
      inventory: {
        consumeInventoryItem: () => ({
          ok: true,
          item: cleanseSaltItem,
          remainingQuantity: 0,
        }),
        getInventoryQuantities: () => new Map(),
        getInventoryQuantity: () => 1,
        grantInventoryItem: () => 1,
        recordItemUse: () => ({
          shopPurchaseCount: 0,
          itemUseCount: 1,
          usedTriggerRandomGroupEvent: false,
          usedAutoRollItem: false,
          usedCleanseItem: true,
        }),
      },
      itemEffects: {
        ...createItemEffectsStub(),
        clearAllNegativeTemporaryEffects: () => 0,
      },
      pvp: {
        getActiveDiceLockout: () => nowMs + 3 * 60 * 60 * 1000,
        setDicePvpEffects: ({ lockoutUntil }) => {
          nextLockoutUntil = lockoutUntil;
        },
      },
      progression: {
        awardAchievements: () => [],
      },
      shopCatalog: {
        getDiceShopItem: () => cleanseSaltItem,
      },
      unitOfWork: {
        runInTransaction: (work) => work(),
      },
    });

    const result = await useDiceItem({
      userId: "user-1",
      itemId: cleanseSaltItem.id,
      reserveAutoRollSession: () => null,
      triggerRandomGroupEvent: async () => ({ ok: false, reason: "disabled" }),
    });

    assert.equal(result.ok, true);
    assert.equal(nextLockoutUntil, new Date(nowMs + 2 * 60 * 60 * 1000).toISOString());
    if (result.ok) {
      assert.match(result.statusMessage, /removed 1 hour from active lockout/);
    }
  } finally {
    Date.now = originalDateNow;
  }
});

test("double-roll uses items cannot be consumed while another item double-roll buff is active", async () => {
  let consumeCalls = 0;
  const useDiceItem = createUseDiceItemUseCase({
    inventory: {
      consumeInventoryItem: () => {
        consumeCalls += 1;
        return {
          ok: true,
          item: revolverItem,
          remainingQuantity: 0,
        };
      },
      getInventoryQuantities: () => new Map(),
      getInventoryQuantity: () => 1,
      grantInventoryItem: () => 1,
      recordItemUse: () => ({
        shopPurchaseCount: 0,
        itemUseCount: 1,
        usedTriggerRandomGroupEvent: false,
        usedAutoRollItem: false,
        usedCleanseItem: false,
      }),
    },
    itemEffects: {
      ...createItemEffectsStub(),
      getItemDoubleRollStatus: () => ({
        isActive: true,
        remainingUses: 2,
        expiresAtMs: null,
      }),
    },
    pvp: {
      getActiveDiceLockout: () => null,
      setDicePvpEffects: () => undefined,
    },
    progression: {
      awardAchievements: () => [],
    },
    shopCatalog: {
      getDiceShopItem: () => revolverItem,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = await useDiceItem({
    userId: "user-1",
    itemId: revolverItem.id,
    reserveAutoRollSession: () => null,
    triggerRandomGroupEvent: async () => ({ ok: false, reason: "disabled" }),
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.message,
    "You already have an item providing a roll set multiplier, please finish that usage before using another one!",
  );
  assert.equal(consumeCalls, 0);
});

test("double-roll duration items cannot be consumed while another item double-roll buff is active", async () => {
  let consumeCalls = 0;
  const useDiceItem = createUseDiceItemUseCase({
    inventory: {
      consumeInventoryItem: () => {
        consumeCalls += 1;
        return {
          ok: true,
          item: longburnSpringItem,
          remainingQuantity: 0,
        };
      },
      getInventoryQuantities: () => new Map(),
      getInventoryQuantity: () => 1,
      grantInventoryItem: () => 1,
      recordItemUse: () => ({
        shopPurchaseCount: 0,
        itemUseCount: 1,
        usedTriggerRandomGroupEvent: false,
        usedAutoRollItem: false,
        usedCleanseItem: false,
      }),
    },
    itemEffects: {
      ...createItemEffectsStub(),
      getItemDoubleRollStatus: () => ({
        isActive: true,
        remainingUses: 0,
        expiresAtMs: Date.now() + 60_000,
      }),
    },
    pvp: {
      getActiveDiceLockout: () => null,
      setDicePvpEffects: () => undefined,
    },
    progression: {
      awardAchievements: () => [],
    },
    shopCatalog: {
      getDiceShopItem: () => longburnSpringItem,
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = await useDiceItem({
    userId: "user-1",
    itemId: longburnSpringItem.id,
    reserveAutoRollSession: () => null,
    triggerRandomGroupEvent: async () => ({ ok: false, reason: "disabled" }),
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.message,
    "You already have an item providing a roll set multiplier, please finish that usage before using another one!",
  );
  assert.equal(consumeCalls, 0);
});
