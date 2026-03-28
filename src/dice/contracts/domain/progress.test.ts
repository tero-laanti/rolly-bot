import assert from "node:assert/strict";
import test from "node:test";

import { createContractProgress, recordProgress, recordProgressAcrossContracts } from "./progress";
import { contractFromData } from "./types";

const makeContract = (requiredCount: number = 3) =>
  contractFromData("daily", {
    id: "c1",
    title: "Daily contract",
    description: "Do the thing",
    objective: {
      type: "roll_count",
      requiredCount,
    },
    reward: {
      fame: 2,
      pips: 5,
    },
  });

test("progress accumulates and rewards exactly once", () => {
  const contract = makeContract(3);
  const base = createContractProgress(contract);

  const first = recordProgress(base, "roll_count", 1, new Date("2026-03-01T00:00:00Z"));
  assert.equal(first.progress.currentCount, 1);
  assert.equal(first.rewardGranted, null);
  assert.equal(first.newlyCompleted, false);

  const second = recordProgress(first.progress, "roll_count", 2, new Date("2026-03-01T00:05:00Z"));
  assert.equal(second.progress.currentCount, 3);
  assert.notEqual(second.progress.completedAt, undefined);
  assert.notEqual(second.progress.rewardedAt, undefined);
  assert.deepEqual(second.rewardGranted, { fame: 2, pips: 5 });
  assert.equal(second.newlyCompleted, true);

  const third = recordProgress(second.progress, "roll_count", 5, new Date("2026-03-01T00:10:00Z"));
  assert.equal(third.progress.currentCount, 3);
  assert.equal(third.rewardGranted, null);
  assert.equal(third.newlyCompleted, false);
});

test("mismatched objective types do not alter progress", () => {
  const contract = makeContract(2);
  const base = createContractProgress(contract);

  const result = recordProgress(base, "pvp_win_count", 1, new Date("2026-03-01T01:00:00Z"));
  assert.equal(result.progress.currentCount, 0);
  assert.equal(result.rewardGranted, null);
});

test("non-positive increments do not reduce or advance progress", () => {
  const contract = makeContract(3);
  const base = createContractProgress(contract);

  const seeded = recordProgress(base, "roll_count", 2, new Date("2026-03-01T02:00:00Z"));
  assert.equal(seeded.progress.currentCount, 2);

  const zeroIncrement = recordProgress(
    seeded.progress,
    "roll_count",
    0,
    new Date("2026-03-01T02:05:00Z"),
  );
  assert.equal(zeroIncrement.progress.currentCount, 2);
  assert.equal(zeroIncrement.newlyCompleted, false);
  assert.equal(zeroIncrement.rewardGranted, null);

  const negativeIncrement = recordProgress(
    seeded.progress,
    "roll_count",
    -5,
    new Date("2026-03-01T02:10:00Z"),
  );
  assert.equal(negativeIncrement.progress.currentCount, 2);
  assert.equal(negativeIncrement.newlyCompleted, false);
  assert.equal(negativeIncrement.rewardGranted, null);
});

test("single event can update multiple active contracts", () => {
  const daily = createContractProgress(
    contractFromData("daily", {
      id: "daily-roll",
      title: "Daily roll",
      description: "Roll once",
      objective: { type: "roll_count", requiredCount: 1 },
      reward: { fame: 1, pips: 2 },
    }),
  );
  const weekly = createContractProgress(
    contractFromData("weekly", {
      id: "weekly-roll",
      title: "Weekly roll",
      description: "Roll thrice",
      objective: { type: "roll_count", requiredCount: 3 },
      reward: { fame: 4, pips: 10 },
    }),
  );
  const unrelated = createContractProgress(
    contractFromData("daily", {
      id: "daily-pvp",
      title: "Daily pvp",
      description: "Win pvp",
      objective: { type: "pvp_win_count", requiredCount: 1 },
      reward: { fame: 1, pips: 1 },
    }),
  );

  const updates = recordProgressAcrossContracts(
    [daily, weekly, unrelated],
    "roll_count",
    1,
    new Date("2026-03-01T03:00:00Z"),
  );

  assert.equal(updates.length, 2);
  assert.deepEqual(
    updates.map((entry) => entry.contractId),
    ["daily-roll", "weekly-roll"],
  );
  assert.equal(updates[0]?.update.progress.currentCount, 1);
  assert.notEqual(updates[0]?.update.progress.rewardedAt, undefined);
  assert.equal(updates[1]?.update.progress.currentCount, 1);
  assert.equal(updates[1]?.update.rewardGranted, null);
});
