import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteEconomyRepository } from "./balance-repository";

test("grantDailyPipsIfEligible awards once per UTC day", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const economy = createSqliteEconomyRepository(db);

  const first = economy.grantDailyPipsIfEligible({
    userId: "user-1",
    amount: 5,
    nowMs: Date.parse("2026-03-20T09:00:00.000Z"),
  });
  const second = economy.grantDailyPipsIfEligible({
    userId: "user-1",
    amount: 5,
    nowMs: Date.parse("2026-03-20T18:00:00.000Z"),
  });
  const third = economy.grantDailyPipsIfEligible({
    userId: "user-1",
    amount: 5,
    nowMs: Date.parse("2026-03-21T00:00:00.000Z"),
  });

  assert.deepEqual(first, {
    awarded: true,
    pips: 5,
    lastDailyPipRewardAt: "2026-03-20T09:00:00.000Z",
  });
  assert.deepEqual(second, {
    awarded: false,
    pips: 5,
    lastDailyPipRewardAt: "2026-03-20T09:00:00.000Z",
  });
  assert.deepEqual(third, {
    awarded: true,
    pips: 10,
    lastDailyPipRewardAt: "2026-03-21T00:00:00.000Z",
  });
});

test("getTopBalanceEntries sorts by the requested metric and excludes empty rows", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const economy = createSqliteEconomyRepository(db);

  economy.applyFameDelta({ userId: "user-1", amount: 40 });
  economy.applyPipsDelta({ userId: "user-1", amount: 15 });
  economy.applyFameDelta({ userId: "user-2", amount: 40 });
  economy.applyPipsDelta({ userId: "user-2", amount: 18 });
  economy.applyFameDelta({ userId: "user-3", amount: 12 });
  economy.applyPipsDelta({ userId: "user-3", amount: 25 });
  economy.applyFameDelta({ userId: "user-4", amount: 0 });

  assert.deepEqual(
    economy.getTopBalanceEntries({
      metric: "fame",
      limit: 3,
    }),
    [
      { userId: "user-2", fame: 40, pips: 18 },
      { userId: "user-1", fame: 40, pips: 15 },
      { userId: "user-3", fame: 12, pips: 25 },
    ],
  );

  assert.deepEqual(
    economy.getTopBalanceEntries({
      metric: "pips",
      limit: 2,
    }),
    [
      { userId: "user-3", fame: 12, pips: 25 },
      { userId: "user-2", fame: 40, pips: 18 },
    ],
  );
});
