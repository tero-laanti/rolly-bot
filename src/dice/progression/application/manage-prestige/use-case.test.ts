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
      getActiveDicePrestige: () => activePrestige,
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
      getActiveDicePrestige: () => activePrestige,
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
