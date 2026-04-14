import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContractRotation,
  deterministicShuffle,
  findDeterministicOffer,
  getContractResetAt,
  getContractResetWindow,
  pickDeterministicOffer,
} from "./rotation";

const offerPool = [
  {
    id: "simple-a",
    title: "A",
    description: "A",
    cadence: "daily" as const,
    difficulty: "simple" as const,
    objective: { type: "roll_count" as const, requiredCount: 5 },
    rewardPips: 12,
  },
  {
    id: "simple-b",
    title: "B",
    description: "B",
    cadence: "daily" as const,
    difficulty: "simple" as const,
    objective: { type: "roll_count" as const, requiredCount: 6 },
    rewardPips: 12,
  },
  {
    id: "simple-c",
    title: "C",
    description: "C",
    cadence: "daily" as const,
    difficulty: "simple" as const,
    objective: { type: "roll_count" as const, requiredCount: 7 },
    rewardPips: 12,
  },
];

test("daily reset windows roll over at midnight UTC", () => {
  const beforeMidnight = new Date(Date.UTC(2026, 2, 28, 23, 59, 0));
  const afterMidnight = new Date(Date.UTC(2026, 2, 29, 0, 0, 0));

  assert.notEqual(
    getContractResetWindow("daily", beforeMidnight),
    getContractResetWindow("daily", afterMidnight),
  );
  assert.equal(
    getContractResetAt("daily", getContractResetWindow("daily", beforeMidnight)).toISOString(),
    "2026-03-29T00:00:00.000Z",
  );
});

test("weekly reset windows anchor on Monday UTC", () => {
  const sunday = new Date(Date.UTC(2026, 2, 29, 12, 0, 0));
  const monday = new Date(Date.UTC(2026, 2, 30, 12, 0, 0));
  const tuesday = new Date(Date.UTC(2026, 2, 31, 12, 0, 0));

  assert.notEqual(
    getContractResetWindow("weekly", sunday),
    getContractResetWindow("weekly", monday),
  );
  assert.equal(getContractResetWindow("weekly", monday), getContractResetWindow("weekly", tuesday));
});

test("deterministic shuffle is stable for the same seed", () => {
  assert.deepEqual(
    deterministicShuffle(["a", "b", "c"], "seed"),
    deterministicShuffle(["a", "b", "c"], "seed"),
  );
});

test("deterministic offer picking respects exclusions", () => {
  const selected = pickDeterministicOffer(offerPool, "seed", new Set(["simple-a", "simple-b"]));
  assert.equal(selected.id, "simple-c");
});

test("deterministic offer lookup returns null when no authored replacement remains", () => {
  const selected = findDeterministicOffer(
    offerPool,
    "seed",
    new Set(["simple-a", "simple-b", "simple-c"]),
  );
  assert.equal(selected, null);
});

test("contract rotation exposes 3 daily and 5 weekly contracts", () => {
  const now = new Date(Date.UTC(2026, 3, 14, 5, 0, 0));
  const catalog = {
    daily: Array.from({ length: 6 }, (_, index) => ({
      id: `daily-${index + 1}`,
      title: `Daily ${index + 1}`,
      description: `Daily ${index + 1}`,
      cadence: "daily" as const,
      objective: { type: "roll_count" as const, requiredCount: index + 1 },
      reward: { pips: 10 + index, fame: 0 },
    })),
    weekly: Array.from({ length: 7 }, (_, index) => ({
      id: `weekly-${index + 1}`,
      title: `Weekly ${index + 1}`,
      description: `Weekly ${index + 1}`,
      cadence: "weekly" as const,
      objective: { type: "roll_count" as const, requiredCount: index + 1 },
      reward: { pips: 20 + index, fame: 0 },
    })),
  };

  const rotation = buildContractRotation(catalog, now);

  assert.equal(rotation.daily.contracts.length, 3);
  assert.equal(rotation.weekly.contracts.length, 5);
});
