import assert from "node:assert/strict";
import test from "node:test";
import { getDicePrestigeBaseDiceCount } from "../../domain/game-rules";
import { createDicePrestigeUseCase } from "./use-case";

test("switching active prestige does not reset dice-count analytics progress", () => {
  let activePrestige = 2;
  let resetDiceCountCalls = 0;

  const useCase = createDicePrestigeUseCase({
    analytics: {
      resetDicePrestigeAnalyticsProgress: () => {
        resetDiceCountCalls += 1;
      },
    },
    progression: {
      awardAchievements: () => [],
      clearDiceBan: () => {},
      getActiveDicePrestige: () => activePrestige,
      getDiceBans: () => new Map(),
      getDiceCount: () => 8,
      getDicePrestige: () => 2,
      setActiveDicePrestige: ({ prestige }) => {
        activePrestige = prestige;
      },
      setDiceCountForPrestige: () => {},
      setDicePrestige: () => {},
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase.handleDicePrestigeAction("user-1", {
    type: "set",
    ownerId: "user-1",
    prestige: 1,
  });

  assert.equal(result.kind, "update");
  assert.equal(activePrestige, 1);
  assert.equal(resetDiceCountCalls, 0);
});

test("prestige up still resets prestige analytics progress", () => {
  let activePrestige = 0;
  let highestPrestige = 0;
  let resetPrestigeCalls = 0;

  const useCase = createDicePrestigeUseCase({
    analytics: {
      resetDicePrestigeAnalyticsProgress: () => {
        resetPrestigeCalls += 1;
      },
    },
    progression: {
      awardAchievements: () => [],
      clearDiceBan: () => {},
      getActiveDicePrestige: () => activePrestige,
      getDiceBans: () => new Map(),
      getDiceCount: () => getDicePrestigeBaseDiceCount(),
      getDicePrestige: () => highestPrestige,
      setActiveDicePrestige: ({ prestige }) => {
        activePrestige = prestige;
      },
      setDiceCountForPrestige: () => {},
      setDicePrestige: ({ prestige }) => {
        highestPrestige = prestige;
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase.handleDicePrestigeAction("user-1", {
    type: "up",
    ownerId: "user-1",
  });

  assert.equal(result.kind, "update");
  assert.equal(activePrestige, 1);
  assert.equal(highestPrestige, 1);
  assert.equal(resetPrestigeCalls, 1);
});

test("prestige chooser opens on the active page and only shows needed arrows", () => {
  const useCase = createDicePrestigeUseCase({
    analytics: {
      resetDicePrestigeAnalyticsProgress: () => {},
    },
    progression: {
      awardAchievements: () => [],
      clearDiceBan: () => {},
      getActiveDicePrestige: () => 24,
      getDiceBans: () => new Map(),
      getDiceCount: () => 8,
      getDicePrestige: () => 25,
      setActiveDicePrestige: () => {},
      setDiceCountForPrestige: () => {},
      setDicePrestige: () => {},
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase.handleDicePrestigeAction("user-1", {
    type: "choose",
    ownerId: "user-1",
  });

  assert.equal(result.payload.type, "view");
  if (result.payload.type !== "view") {
    return;
  }

  assert.match(result.payload.view.content, /Page 2\/2\./);
  assert.deepEqual(
    result.payload.view.components.at(-1)?.map((button) => button.label),
    ["←", "Back"],
  );
});

test("prestige chooser page actions navigate and show a forward arrow only when another page exists", () => {
  const useCase = createDicePrestigeUseCase({
    analytics: {
      resetDicePrestigeAnalyticsProgress: () => {},
    },
    progression: {
      awardAchievements: () => [],
      clearDiceBan: () => {},
      getActiveDicePrestige: () => 24,
      getDiceBans: () => new Map(),
      getDiceCount: () => 8,
      getDicePrestige: () => 25,
      setActiveDicePrestige: () => {},
      setDiceCountForPrestige: () => {},
      setDicePrestige: () => {},
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = useCase.handleDicePrestigeAction("user-1", {
    type: "page",
    ownerId: "user-1",
    page: 0,
  });

  assert.equal(result.payload.type, "view");
  if (result.payload.type !== "view") {
    return;
  }

  assert.match(result.payload.view.content, /Page 1\/2\./);
  assert.deepEqual(
    result.payload.view.components.at(-1)?.map((button) => button.label),
    ["Back", "→"],
  );
});

test("switching active prestige prunes bans on dice above the new active dice count", () => {
  let activePrestige = 1;
  const bans = new Map<number, Set<number>>([
    [1, new Set([2])],
    [6, new Set([4])],
  ]);

  const useCase = createDicePrestigeUseCase({
    analytics: {
      resetDicePrestigeAnalyticsProgress: () => {},
    },
    progression: {
      awardAchievements: () => [],
      clearDiceBan: (_userId, dieIndex) => {
        bans.delete(dieIndex);
      },
      getActiveDicePrestige: () => activePrestige,
      getDiceBans: () => bans,
      getDiceCount: () => (activePrestige === 2 ? 1 : 6),
      getDicePrestige: () => 2,
      setActiveDicePrestige: ({ prestige }) => {
        activePrestige = prestige;
      },
      setDiceCountForPrestige: () => {},
      setDicePrestige: () => {},
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  useCase.handleDicePrestigeAction("user-1", {
    type: "set",
    ownerId: "user-1",
    prestige: 2,
  });

  assert.deepEqual([...bans.keys()], [1]);
});
