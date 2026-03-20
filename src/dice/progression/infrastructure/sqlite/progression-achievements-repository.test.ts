import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createSqliteProgressionAchievementsRepository } from "./progression-achievements-repository";

test("achievement pip rewards are granted only on first unlock", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const progression = createSqliteProgressionAchievementsRepository(db);
  const economy = createSqliteEconomyRepository(db);

  const first = progression.awardAchievements("user-1", ["first-roll", "first-level-up"]);
  const second = progression.awardAchievements("user-1", ["first-roll", "first-level-up"]);

  assert.deepEqual(first, ["first-roll", "first-level-up"]);
  assert.deepEqual(second, []);
  assert.equal(economy.getPips("user-1"), 6);
});
