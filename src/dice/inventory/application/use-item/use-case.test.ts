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
  assert.equal(result.achievementText, undefined);
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
  assert.equal(result.achievementText, undefined);
});
