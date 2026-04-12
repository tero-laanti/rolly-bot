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

  const achievementIds = ["example-pair", "example-manual-achievement"];
  const first = progression.awardAchievements("user-1", achievementIds);
  const second = progression.awardAchievements("user-1", achievementIds);

  assert.deepEqual(first, achievementIds);
  assert.deepEqual(second, []);
  assert.equal(economy.getPips("user-1"), 23);
});

test("achievement pip rewards respect Pip Magnet bonuses", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  db.prepare(
    `
    INSERT INTO inventory_items (user_id, item_id, quantity, first_acquired_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run("user-1", "pip-magnet", 2, "2026-03-27T12:00:00.000Z", "2026-03-27T12:00:00.000Z");
  const progression = createSqliteProgressionAchievementsRepository(db);
  const economy = createSqliteEconomyRepository(db);

  const newlyEarned = progression.awardAchievements("user-1", [
    "example-pair",
    "example-manual-achievement",
  ]);

  assert.deepEqual(newlyEarned, ["example-pair", "example-manual-achievement"]);
  assert.equal(economy.getPips("user-1"), 27);
});
