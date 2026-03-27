import assert from "node:assert/strict";
import test from "node:test";
import type { DiceInventoryEntry } from "../../domain/shop";
import { discordMessageCharacterLimit } from "../../../../shared/discord";
import { createDiceInventoryUseCase } from "./use-case";

const createConsumableEntry = (
  index: number,
  description: string = `Item ${index} description.`,
): DiceInventoryEntry => ({
  item: {
    id: `consumable-${index}`,
    name: `Consumable ${index}`,
    description,
    pricePips: index,
    consumable: true,
    effect: {
      type: "double-roll-uses",
      uses: index,
    },
  },
  quantity: 1,
});

const createPassiveEntry = (index: number, description: string): DiceInventoryEntry => ({
  item: {
    id: `upgrade-${index}`,
    name: `Upgrade ${index}`,
    description,
    pricePips: 100 + index,
    consumable: false,
    effect: {
      type: "passive-extra-shield-on-umbrella",
      extraCharges: 1,
    },
  },
  quantity: 1,
});

const zeroPermanentBonuses = {
  getPermanentBonuses: () => ({
    extraBanSlots: 0,
    pipRewardBonusPercent: 0,
    personalCharge: {
      unlocked: false,
      minutesPerMultiplier: 0,
      speedMultiplier: 1,
      maxMultiplier: 1,
    },
  }),
};

const createTestInventoryUseCase = (entries: DiceInventoryEntry[]) => {
  return createDiceInventoryUseCase({
    inventory: {
      getOwnedInventoryEntries: () => entries,
    },
    permanentBonuses: zeroPermanentBonuses,
    useDiceItem: async () => ({
      ok: false,
      message: "Not used in this test.",
    }),
  });
};

const interactionOptions = {
  reserveAutoRollSession: () => null,
  triggerRandomGroupEvent: async () => ({
    ok: false as const,
    reason: "unavailable" as const,
  }),
};

test("inventory paging splits after 20 consumable buttons and shows arrows only when needed", async () => {
  const useCase = createTestInventoryUseCase(
    Array.from({ length: 21 }, (_, index) => createConsumableEntry(index + 1)),
  );

  const firstPage = useCase.createDiceInventoryReply("user-1");
  assert.equal(firstPage.payload.type, "view");
  if (firstPage.payload.type !== "view") {
    return;
  }

  assert.match(firstPage.payload.view.content, /Page 1\/2\./);
  assert.equal(firstPage.payload.view.components.length, 5);
  assert.deepEqual(
    firstPage.payload.view.components[4]?.map((button) => button.label),
    ["Refresh", "→"],
  );

  const secondPage = await useCase.handleDiceInventoryAction(
    "user-1",
    { type: "page", ownerId: "user-1", page: 1 },
    interactionOptions,
  );
  assert.equal(secondPage.result.payload.type, "view");
  if (secondPage.result.payload.type !== "view") {
    return;
  }

  assert.match(secondPage.result.payload.view.content, /Page 2\/2\./);
  assert.equal(secondPage.result.payload.view.components.length, 2);
  assert.deepEqual(
    secondPage.result.payload.view.components[1]?.map((button) => button.label),
    ["←", "Refresh"],
  );
});

test("inventory paging also splits when entry text would exceed Discord's message limit", async () => {
  const useCase = createTestInventoryUseCase([
    createPassiveEntry(1, "A".repeat(1_700)),
    createPassiveEntry(2, "B".repeat(1_700)),
  ]);

  const firstPage = useCase.createDiceInventoryReply("user-1");
  assert.equal(firstPage.payload.type, "view");
  if (firstPage.payload.type !== "view") {
    return;
  }

  assert.match(firstPage.payload.view.content, /Upgrade 1/);
  assert.doesNotMatch(firstPage.payload.view.content, /Upgrade 2/);
  assert.deepEqual(
    firstPage.payload.view.components[0]?.map((button) => button.label),
    ["Refresh", "→"],
  );

  const secondPage = await useCase.handleDiceInventoryAction(
    "user-1",
    { type: "page", ownerId: "user-1", page: 1 },
    interactionOptions,
  );
  assert.equal(secondPage.result.payload.type, "view");
  if (secondPage.result.payload.type !== "view") {
    return;
  }

  assert.match(secondPage.result.payload.view.content, /Upgrade 2/);
  assert.doesNotMatch(secondPage.result.payload.view.content, /Upgrade 1/);
  assert.deepEqual(
    secondPage.result.payload.view.components[0]?.map((button) => button.label),
    ["←", "Refresh"],
  );
});

test("inventory view truncates long runtime status text before exceeding Discord's message limit", async () => {
  const useCase = createDiceInventoryUseCase({
    inventory: {
      getOwnedInventoryEntries: () => [createPassiveEntry(1, "A".repeat(1_700))],
    },
    permanentBonuses: zeroPermanentBonuses,
    useDiceItem: async () => ({
      ok: true as const,
      item: createConsumableEntry(99).item,
      remainingQuantity: 1,
      statusMessage: `Status: ${"S".repeat(500)}`,
      achievementAnnouncements: [],
    }),
  });

  const result = await useCase.handleDiceInventoryAction(
    "user-1",
    { type: "use", ownerId: "user-1", itemId: "consumable-99", page: 0 },
    interactionOptions,
  );

  assert.equal(result.result.payload.type, "view");
  if (result.result.payload.type !== "view") {
    return;
  }

  assert.ok(result.result.payload.view.content.length <= discordMessageCharacterLimit);
  assert.match(result.result.payload.view.content, /^Status: S+/);
  assert.match(result.result.payload.view.content, /\*\*Upgrade 1\*\*/);
});
