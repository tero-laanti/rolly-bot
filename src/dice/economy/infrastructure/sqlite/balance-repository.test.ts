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

test("initializeDatabaseSchema migrates legacy balances tables for daily pip rewards", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE balances (
      user_id TEXT PRIMARY KEY,
      fame INTEGER NOT NULL DEFAULT 0,
      pips INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  initializeDatabaseSchema(db);
  const economy = createSqliteEconomyRepository(db);

  const reward = economy.grantDailyPipsIfEligible({
    userId: "legacy-user",
    amount: 5,
    nowMs: Date.parse("2026-03-20T09:00:00.000Z"),
  });

  assert.deepEqual(reward, {
    awarded: true,
    pips: 5,
    lastDailyPipRewardAt: "2026-03-20T09:00:00.000Z",
  });
});
