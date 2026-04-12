import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCompletionToCadenceState,
  createAcceptedRun,
  createEmptyContractCadenceState,
  getActiveRun,
  getUsedContractIds,
  updateContractRunProgress,
} from "./progress";
import type { ContractOfferChoice } from "./progress";

const makeChoice = (source: ContractOfferChoice["source"] = "initial"): ContractOfferChoice => ({
  cadence: "daily",
  difficulty: "serious",
  source,
  rerollUsed: source === "reroll",
  rerollAvailable: source === "initial",
  offer: {
    id: "daily-serious-roll",
    title: "Serious Roller",
    description: "Use /roll 10 times.",
    cadence: "daily",
    difficulty: "serious",
    objective: {
      type: "roll_count",
      requiredCount: 10,
    },
    rewardPips: 20,
  },
});

test("accepted runs capture the selected offer snapshot", () => {
  const run = createAcceptedRun(
    makeChoice(),
    "user-1",
    "2026-03-28",
    1,
    new Date("2026-03-28T10:00:00.000Z"),
  );

  assert.equal(run.contractId, "daily-serious-roll");
  assert.equal(run.contractTitle, "Serious Roller");
  assert.equal(run.rewardPips, 20);
  assert.equal(run.acceptedVia, "initial");
});

test("progress updates complete a run and grant pips once", () => {
  const baseRun = createAcceptedRun(
    makeChoice("reroll"),
    "user-1",
    "2026-03-28",
    1,
    new Date("2026-03-28T10:00:00.000Z"),
  );

  const first = updateContractRunProgress(
    baseRun,
    "roll_count",
    4,
    new Date("2026-03-28T10:10:00.000Z"),
  );
  assert(first);
  assert(first.run);
  assert.equal(first.run.currentCount, 4);
  assert.equal(first.rewardGrantedPips, 0);

  const second = updateContractRunProgress(
    first.run,
    "roll_count",
    6,
    new Date("2026-03-28T10:20:00.000Z"),
  );
  assert(second);
  assert(second.run);
  assert.equal(second.run.currentCount, 10);
  assert.equal(second.rewardGrantedPips, 20);
  assert.equal(second.newlyCompleted, true);

  const third = updateContractRunProgress(
    second.run,
    "roll_count",
    2,
    new Date("2026-03-28T10:30:00.000Z"),
  );
  assert.equal(third, null);
});

test("completion state keeps same-difficulty refills open until the cadence cap is reached", () => {
  const state = createEmptyContractCadenceState("user-1", "daily", "2026-03-28");
  const firstRun = createAcceptedRun(
    makeChoice(),
    "user-1",
    "2026-03-28",
    1,
    new Date("2026-03-28T10:00:00.000Z"),
  );
  const secondRun = createAcceptedRun(
    makeChoice("refill"),
    "user-1",
    "2026-03-28",
    2,
    new Date("2026-03-28T11:00:00.000Z"),
  );

  const afterFirst = applyCompletionToCadenceState(
    state,
    { ...firstRun, completedAt: new Date("2026-03-28T10:30:00.000Z") },
    new Date("2026-03-28T10:30:00.000Z"),
    3,
  );
  assert.equal(afterFirst.completionCount, 1);
  assert.equal(afterFirst.refillAvailableDifficulty, "serious");

  const afterSecond = applyCompletionToCadenceState(
    afterFirst,
    { ...secondRun, completedAt: new Date("2026-03-28T11:30:00.000Z") },
    new Date("2026-03-28T11:30:00.000Z"),
    3,
  );
  assert.equal(afterSecond.completionCount, 2);
  assert.equal(afterSecond.refillAvailableDifficulty, "serious");

  const afterThird = applyCompletionToCadenceState(
    afterSecond,
    { ...secondRun, completedAt: new Date("2026-03-28T12:30:00.000Z") },
    new Date("2026-03-28T12:30:00.000Z"),
    3,
  );
  assert.equal(afterThird.completionCount, 3);
  assert.equal(afterThird.refillAvailableDifficulty, undefined);
});

test("active run lookup and used contract ids reflect accepted history", () => {
  const firstRun = createAcceptedRun(
    makeChoice(),
    "user-1",
    "2026-03-28",
    1,
    new Date("2026-03-28T10:00:00.000Z"),
  );
  const secondRun = createAcceptedRun(
    {
      ...makeChoice("refill"),
      offer: { ...makeChoice("refill").offer, id: "daily-serious-refill" },
    },
    "user-1",
    "2026-03-28",
    2,
    new Date("2026-03-28T11:00:00.000Z"),
  );
  const runs = [{ ...firstRun, completedAt: new Date("2026-03-28T10:30:00.000Z") }, secondRun];

  assert.equal(getActiveRun(runs)?.contractId, "daily-serious-refill");
  assert.deepEqual([...getUsedContractIds(runs)].sort(), [
    "daily-serious-refill",
    "daily-serious-roll",
  ]);
});
