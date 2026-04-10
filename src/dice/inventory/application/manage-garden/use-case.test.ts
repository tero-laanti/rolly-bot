import assert from "node:assert/strict";
import test from "node:test";
import type { DiceShopItem } from "../../domain/shop";
import { createDiceGardenUseCase } from "./use-case";
import type {
  DiceGardenAchievementStats,
  DiceGardenPlot,
  DiceInventoryRepository,
} from "../ports";

const seedSatchel: DiceShopItem = {
  id: "seed-satchel",
  name: "Seed Satchel",
  description: "Permanent upgrade: unlocks /garden and lets you tend one die-seed at a time.",
  pricePips: 10,
  consumable: false,
  effect: {
    type: "passive-garden-unlock",
    slotCount: 1,
  },
};

const mysteriousDieSeed: DiceShopItem = {
  id: "mysterious-die-seed",
  name: "Mysterious Die Seed",
  description: "Plant this in /garden to grow a strange die sapling for later harvest.",
  pricePips: 5,
  consumable: true,
  requiresItemId: "seed-satchel",
  effect: {
    type: "garden-seed",
    outcomes: [{ sides: 6, weight: 1 }],
  },
};

const createTestUseCase = ({
  inventoryEntries = [
    [seedSatchel.id, 1],
    [mysteriousDieSeed.id, 1],
  ],
  initialPlots = [],
  awardedAmount = 21,
}: {
  inventoryEntries?: Array<[string, number]>;
  initialPlots?: DiceGardenPlot[];
  awardedAmount?: number;
} = {}) => {
  const inventoryQuantities = new Map<string, number>(inventoryEntries);
  const plots = [...initialPlots];
  let gardenStats: DiceGardenAchievementStats = {
    plantedSeedCount: 0,
    harvestedSeedCount: 0,
    harvestedD12Count: 0,
  };
  let grantRewardCalls = 0;

  const inventory: Pick<
    DiceInventoryRepository,
    "consumeInventoryItem" | "getInventoryQuantities" | "getInventoryQuantity"
  > = {
    getInventoryQuantities: () => new Map(inventoryQuantities),
    getInventoryQuantity: (_userId, itemId) => inventoryQuantities.get(itemId) ?? 0,
    consumeInventoryItem: ({ itemId }) => {
      const current = inventoryQuantities.get(itemId) ?? 0;
      if (current < 1) {
        return { ok: false as const, reason: "not-owned" as const, item: mysteriousDieSeed };
      }
      inventoryQuantities.set(itemId, current - 1);
      return {
        ok: true as const,
        item: mysteriousDieSeed,
        remainingQuantity: current - 1,
      };
    },
  };

  const garden = {
    getActiveGardenPlots: () => [...plots],
    createGardenPlot: (input: {
      userId: string;
      slotIndex: number;
      seedItemId: string;
      dieSides: 4 | 6 | 8 | 10 | 12;
      plantedAt: string;
      readyAt: string;
    }) => {
      const plot: DiceGardenPlot = {
        ...input,
        updatedAt: input.plantedAt,
      };
      plots.splice(0, plots.length, plot);
      return plot;
    },
    clearGardenPlot: ({ slotIndex }: { userId: string; slotIndex: number }) => {
      const index = plots.findIndex((plot) => plot.slotIndex === slotIndex);
      if (index >= 0) {
        plots.splice(index, 1);
      }
    },
    getGardenAchievementStats: () => gardenStats,
    recordGardenPlant: () => {
      gardenStats = {
        ...gardenStats,
        plantedSeedCount: gardenStats.plantedSeedCount + 1,
      };
      return gardenStats;
    },
    recordGardenHarvest: ({ dieSides }: { userId: string; dieSides: 4 | 6 | 8 | 10 | 12 }) => {
      gardenStats = {
        ...gardenStats,
        harvestedSeedCount: gardenStats.harvestedSeedCount + 1,
        harvestedD12Count: gardenStats.harvestedD12Count + (dieSides === 12 ? 1 : 0),
      };
      return gardenStats;
    },
  };

  const useCase = createDiceGardenUseCase({
    economy: {
      grantRewardPips: () => {
        grantRewardCalls += 1;
        return {
          awardedAmount,
          pips: awardedAmount,
        };
      },
    },
    inventory,
    garden,
    progression: {
      awardAchievements: () => [],
    },
    shopCatalog: {
      getDiceShopItem: (itemId: string) =>
        [seedSatchel, mysteriousDieSeed].find((item) => item.id === itemId) ?? null,
      getDiceShopItems: () => [seedSatchel, mysteriousDieSeed],
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  return {
    useCase,
    inventoryQuantities,
    plots,
    getGrantRewardCalls: () => grantRewardCalls,
  };
};

test("planting a seed shows the agreed status copy", () => {
  const { useCase, inventoryQuantities, plots } = createTestUseCase();

  const outcome = useCase.handleDiceGardenAction("user-1", {
    type: "plant",
    ownerId: "user-1",
  });

  assert.equal(outcome.result.kind, "update");
  assert.equal(outcome.result.payload.type, "view");
  assert.match(
    outcome.result.payload.view.content,
    /You planted a Mystery Die Seed\. You have 0 seeds left\./,
  );
  assert.match(outcome.result.payload.view.content, /A d6 sapling took root in your garden\./);
  assert.equal(inventoryQuantities.get("mysterious-die-seed"), 0);
  assert.equal(plots.length, 1);
  assert.equal(plots[0]?.dieSides, 6);
});

test("planting is blocked when an active plot already exists", () => {
  const { useCase } = createTestUseCase({
    initialPlots: [
      {
        userId: "user-1",
        slotIndex: 0,
        seedItemId: "mysterious-die-seed",
        dieSides: 8,
        plantedAt: "2026-04-10T10:00:00.000Z",
        readyAt: "2026-04-10T18:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      },
    ],
  });

  const outcome = useCase.handleDiceGardenAction("user-1", {
    type: "plant",
    ownerId: "user-1",
  });

  assert.equal(outcome.result.kind, "reply");
  assert.equal(outcome.result.payload.type, "message");
  assert.equal(outcome.result.payload.content, "Your Seed Satchel is already full.");
});

test("harvesting shows the agreed copy and uses the awarded pip amount", () => {
  const { useCase, plots, getGrantRewardCalls } = createTestUseCase({
    initialPlots: [
      {
        userId: "user-1",
        slotIndex: 0,
        seedItemId: "mysterious-die-seed",
        dieSides: 10,
        plantedAt: "2026-04-10T00:00:00.000Z",
        readyAt: "2026-04-10T01:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
      },
    ],
    awardedAmount: 60,
  });

  const outcome = useCase.handleDiceGardenAction("user-1", {
    type: "harvest",
    ownerId: "user-1",
  });

  assert.equal(outcome.result.kind, "update");
  assert.equal(outcome.result.payload.type, "view");
  assert.match(outcome.result.payload.view.content, /You harvested your d10 sapling\./);
  assert.match(outcome.result.payload.view.content, /It burst into a 60 pips\./);
  assert.equal(getGrantRewardCalls(), 1);
  assert.equal(plots.length, 0);
});
