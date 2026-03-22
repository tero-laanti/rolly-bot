import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteProgressionRepository } from "./progression-repository";

test("getTopPrestigeEntries sorts by prestige, level, then earlier timestamp", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const progression = createSqliteProgressionRepository(db);

  db.prepare(
    `
    INSERT INTO dice_prestige (user_id, prestige, updated_at)
    VALUES (?, ?, ?)
  `,
  ).run("user-1", 4, "2026-03-19T10:00:00.000Z");
  db.prepare(
    `
    INSERT INTO dice_levels_by_prestige (user_id, prestige, level, updated_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run("user-1", 4, 2, "2026-03-21T10:00:00.000Z");

  db.prepare(
    `
    INSERT INTO dice_prestige (user_id, prestige, updated_at)
    VALUES (?, ?, ?)
  `,
  ).run("user-2", 4, "2026-03-18T10:00:00.000Z");
  db.prepare(
    `
    INSERT INTO dice_levels_by_prestige (user_id, prestige, level, updated_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run("user-2", 4, 2, "2026-03-20T10:00:00.000Z");

  db.prepare(
    `
    INSERT INTO dice_prestige (user_id, prestige, updated_at)
    VALUES (?, ?, ?)
  `,
  ).run("user-3", 3, "2026-03-17T10:00:00.000Z");
  db.prepare(
    `
    INSERT INTO dice_levels_by_prestige (user_id, prestige, level, updated_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run("user-3", 3, 6, "2026-03-22T10:00:00.000Z");

  assert.deepEqual(progression.getTopPrestigeEntries(3), [
    { userId: "user-2", prestige: 4, level: 2 },
    { userId: "user-1", prestige: 4, level: 2 },
    { userId: "user-3", prestige: 3, level: 6 },
  ]);
});
