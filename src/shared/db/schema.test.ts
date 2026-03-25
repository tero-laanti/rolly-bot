import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "./schema";

const hasTable = (db: Database.Database, tableName: string): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return Boolean(row);
};

const hasColumn = (db: Database.Database, tableName: string, columnName: string): boolean => {
  if (!hasTable(db, tableName)) {
    return false;
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
};

const createLegacyProgressionSchema = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE dice_levels_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, prestige)
    );

    CREATE TABLE dice_analytics (
      user_id TEXT PRIMARY KEY,
      level_started_at TEXT NOT NULL,
      prestige_started_at TEXT NOT NULL,
      rolls_current_level INTEGER NOT NULL DEFAULT 0,
      near_levelup_rolls_current_level INTEGER NOT NULL DEFAULT 0,
      dice_rolled_current_prestige INTEGER NOT NULL DEFAULT 0,
      total_dice_rolled INTEGER NOT NULL DEFAULT 0,
      pvp_wins INTEGER NOT NULL DEFAULT 0,
      pvp_losses INTEGER NOT NULL DEFAULT 0,
      pvp_draws INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
};

const createCurrentSchemaV1 = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE dice_counts_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      dice_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, prestige)
    );

    CREATE TABLE dice_analytics (
      user_id TEXT PRIMARY KEY,
      dice_count_started_at TEXT NOT NULL,
      prestige_started_at TEXT NOT NULL,
      roll_sets_current_dice_count INTEGER NOT NULL DEFAULT 0,
      near_dice_count_increase_roll_sets_current_dice_count INTEGER NOT NULL DEFAULT 0,
      dice_rolled_current_prestige INTEGER NOT NULL DEFAULT 0,
      total_dice_rolled INTEGER NOT NULL DEFAULT 0,
      pvp_wins INTEGER NOT NULL DEFAULT 0,
      pvp_losses INTEGER NOT NULL DEFAULT 0,
      pvp_draws INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE dice_progression_achievement_stats (
      user_id TEXT PRIMARY KEY,
      roll_commands_total INTEGER NOT NULL DEFAULT 0,
      near_dice_count_increase_rolls_total INTEGER NOT NULL DEFAULT 0,
      highest_charge_multiplier INTEGER NOT NULL DEFAULT 1,
      highest_roll_pass_count INTEGER NOT NULL DEFAULT 1,
      dice_count_increases_total INTEGER NOT NULL DEFAULT 0,
      first_ban_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);
};

test("initializeDatabaseSchema creates the current schema on an empty database", () => {
  const db = new Database(":memory:");

  initializeDatabaseSchema(db);

  assert.equal(hasTable(db, "dice_counts_by_prestige"), true);
  assert.equal(hasTable(db, "dice_analytics"), true);
  assert.equal(hasTable(db, "dice_analytics_by_prestige"), true);
  assert.equal(hasTable(db, "dice_progression_achievement_stats"), true);
  assert.equal(hasColumn(db, "dice_analytics", "total_dice_sets_rolled"), true);
  assert.equal(hasColumn(db, "dice_analytics", "total_roll_commands_called"), true);
  assert.equal(hasColumn(db, "dice_analytics_by_prestige", "prestige_started_at"), true);
  assert.equal(db.pragma("user_version", { simple: true }), 2);
});

test("initializeDatabaseSchema rejects unsupported legacy progression schema without mutating the database", () => {
  const db = new Database(":memory:");
  createLegacyProgressionSchema(db);

  assert.throws(
    () => initializeDatabaseSchema(db),
    /Database schema is incomplete or outdated for this build/,
  );
  assert.equal(hasTable(db, "dice_levels_by_prestige"), true);
  assert.equal(hasTable(db, "dice_counts_by_prestige"), false);
  assert.equal(db.pragma("user_version", { simple: true }), 0);
});

test("initializeDatabaseSchema rejects the previous current schema without mutating the database", () => {
  const db = new Database(":memory:");
  createCurrentSchemaV1(db);

  assert.throws(
    () => initializeDatabaseSchema(db),
    /Database schema is incomplete or outdated for this build/,
  );
  assert.equal(hasTable(db, "dice_analytics_by_prestige"), false);
  assert.equal(hasColumn(db, "dice_analytics", "total_dice_sets_rolled"), false);
  assert.equal(hasColumn(db, "dice_analytics", "total_roll_commands_called"), false);
  assert.equal(db.pragma("user_version", { simple: true }), 0);
});

test("initializeDatabaseSchema rejects an incomplete current schema without mutating the database", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE dice_counts_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, prestige)
    );
  `);

  assert.throws(
    () => initializeDatabaseSchema(db),
    /Database schema is incomplete or outdated for this build/,
  );
  assert.equal(hasTable(db, "dice_analytics_by_prestige"), false);
  assert.equal(db.pragma("user_version", { simple: true }), 0);
});
