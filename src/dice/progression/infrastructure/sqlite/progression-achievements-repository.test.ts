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

  const achievementIds = ["example-pair", "example-manual-prestige"];
  const first = progression.awardAchievements("user-1", achievementIds);
  const second = progression.awardAchievements("user-1", achievementIds);

  assert.deepEqual(first, achievementIds);
  assert.deepEqual(second, []);
  assert.equal(economy.getPips("user-1"), 23);
});
