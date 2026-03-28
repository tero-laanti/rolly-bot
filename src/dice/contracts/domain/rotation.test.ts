import assert from "node:assert/strict";
import test from "node:test";

import {
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
