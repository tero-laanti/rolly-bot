import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContractRotation,
  dailyActiveCount,
  getDailyPeriodKey,
  getWeeklyPeriodKey,
  weeklyActiveCount,
} from "./rotation";
import { contractFromData } from "./types";

const makeContract = (id: string, cadence: "daily" | "weekly") =>
  contractFromData(cadence, {
    id,
    title: `${cadence} contract ${id}`,
    description: `Complete the ${cadence} contract ${id}`,
    objective: {
      type: "roll_count",
      requiredCount: 10,
    },
    reward: {
      pips: 5,
    },
  });

const catalog = {
  daily: ["d1", "d2", "d3", "d4", "d5"].map((id) => makeContract(id, "daily")),
  weekly: ["w1", "w2", "w3", "w4"].map((id) => makeContract(id, "weekly")),
};

test("daily rotation is deterministic within a period", () => {
  const now = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
  const first = buildContractRotation(catalog, now).daily.contracts.map((c) => c.id);
  const second = buildContractRotation(catalog, now).daily.contracts.map((c) => c.id);
  assert.deepEqual(first, second);
  assert.equal(first.length, dailyActiveCount);
});

test("daily period key rolls over at 00:00 UTC", () => {
  const beforeMidnight = new Date(Date.UTC(2026, 2, 10, 23, 59, 0));
  const afterMidnight = new Date(Date.UTC(2026, 2, 11, 0, 0, 0));
  assert.notEqual(getDailyPeriodKey(beforeMidnight), getDailyPeriodKey(afterMidnight));
});

test("weekly period key anchors on Monday 00:00 UTC", () => {
  const sunday = new Date(Date.UTC(2026, 2, 29, 12, 0, 0)); // Sunday
  const monday = new Date(Date.UTC(2026, 2, 30, 12, 0, 0)); // Monday
  const sundayKey = getWeeklyPeriodKey(sunday);
  const mondayKey = getWeeklyPeriodKey(monday);
  assert.notEqual(sundayKey, mondayKey);
  // Monday and Tuesday of the same week should share the key
  const tuesday = new Date(Date.UTC(2026, 3, 1, 12, 0, 0));
  assert.equal(mondayKey, getWeeklyPeriodKey(tuesday));
});

test("weekly rotation is deterministic and selects the configured count", () => {
  const now = new Date(Date.UTC(2026, 5, 15, 8, 0, 0));
  const rotation = buildContractRotation(catalog, now).weekly.contracts.map((c) => c.id);
  const rerun = buildContractRotation(catalog, now).weekly.contracts.map((c) => c.id);
  assert.deepEqual(rotation, rerun);
  assert.equal(rotation.length, weeklyActiveCount);
});
