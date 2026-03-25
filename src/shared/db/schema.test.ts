import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema, migrateLegacyDatabaseSchema } from "./schema";

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

    CREATE TABLE dice_progression_achievement_stats (
      user_id TEXT PRIMARY KEY,
      roll_commands_total INTEGER NOT NULL DEFAULT 0,
      near_levelup_rolls_total INTEGER NOT NULL DEFAULT 0,
      highest_charge_multiplier INTEGER NOT NULL DEFAULT 1,
      highest_roll_pass_count INTEGER NOT NULL DEFAULT 1,
      level_ups_total INTEGER NOT NULL DEFAULT 0,
      first_ban_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE user_achievements (
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    );
  `);
};

const createCurrentProgressionSchemaV1 = (db: Database.Database): void => {
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

test("initializeDatabaseSchema rejects legacy progression schema without mutating the database", () => {
  const db = new Database(":memory:");
  createLegacyProgressionSchema(db);

  assert.throws(() => initializeDatabaseSchema(db), /Legacy dice progression schema detected/);
  assert.equal(hasTable(db, "dice_levels_by_prestige"), true);
  assert.equal(hasTable(db, "dice_counts_by_prestige"), false);
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
    /Current dice-count schema is incomplete or invalid/,
  );
  assert.equal(hasTable(db, "dice_analytics_by_prestige"), false);
  assert.equal(db.pragma("user_version", { simple: true }), 0);
});

test("migrateLegacyDatabaseSchema preserves legacy progression data and rewrites achievement ids", () => {
  const db = new Database(":memory:");
  createLegacyProgressionSchema(db);

  db.prepare("INSERT INTO dice_levels_by_prestige VALUES (?, ?, ?, ?)").run(
    "user-1",
    2,
    7,
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO dice_analytics VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "user-1",
    "2026-01-02T00:00:00.000Z",
    "2026-01-03T00:00:00.000Z",
    4,
    2,
    40,
    100,
    1,
    2,
    3,
    "2026-01-04T00:00:00.000Z",
  );
  db.prepare("INSERT INTO dice_progression_achievement_stats VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    "user-1",
    9,
    5,
    3,
    4,
    2,
    null,
    "2026-01-05T00:00:00.000Z",
  );
  db.prepare("INSERT INTO user_achievements VALUES (?, ?, ?)").run(
    "user-1",
    "first-level-up",
    "2026-01-06T00:00:00.000Z",
  );

  assert.equal(migrateLegacyDatabaseSchema(db), true);
  initializeDatabaseSchema(db);

  assert.equal(hasTable(db, "dice_levels_by_prestige"), false);
  assert.equal(hasColumn(db, "dice_counts_by_prestige", "level"), false);
  assert.equal(hasColumn(db, "dice_analytics", "level_started_at"), false);
  assert.equal(
    hasColumn(db, "dice_progression_achievement_stats", "near_levelup_rolls_total"),
    false,
  );

  assert.deepEqual(db.prepare("SELECT * FROM dice_counts_by_prestige").all(), [
    {
      user_id: "user-1",
      prestige: 2,
      dice_count: 7,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(db.prepare("SELECT * FROM dice_analytics").all(), [
    {
      user_id: "user-1",
      dice_count_started_at: "2026-01-02T00:00:00.000Z",
      prestige_started_at: "2026-01-03T00:00:00.000Z",
      roll_sets_current_dice_count: 4,
      near_dice_count_increase_roll_sets_current_dice_count: 2,
      dice_rolled_current_prestige: 40,
      total_dice_rolled: 100,
      total_dice_sets_rolled: 0,
      total_roll_commands_called: 0,
      pvp_wins: 1,
      pvp_losses: 2,
      pvp_draws: 3,
      updated_at: "2026-01-04T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(db.prepare("SELECT * FROM dice_analytics_by_prestige").all(), [
    {
      user_id: "user-1",
      prestige: 2,
      prestige_started_at: "2026-01-03T00:00:00.000Z",
      dice_count_started_at: "2026-01-02T00:00:00.000Z",
      roll_sets_current_dice_count: 4,
      near_dice_count_increase_roll_sets_current_dice_count: 2,
      dice_rolled_current_prestige: 40,
      updated_at: "2026-01-04T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(db.prepare("SELECT * FROM dice_progression_achievement_stats").all(), [
    {
      user_id: "user-1",
      roll_commands_total: 9,
      near_dice_count_increase_rolls_total: 5,
      highest_charge_multiplier: 3,
      highest_roll_pass_count: 4,
      dice_count_increases_total: 2,
      first_ban_at: null,
      updated_at: "2026-01-05T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(db.prepare("SELECT * FROM user_achievements ORDER BY earned_at ASC").all(), [
    {
      user_id: "user-1",
      achievement_id: "first-extra-die",
      earned_at: "2026-01-06T00:00:00.000Z",
    },
  ]);
  assert.equal(db.pragma("user_version", { simple: true }), 2);
});

test("migrateLegacyDatabaseSchema preserves the earliest earned_at when both legacy and current ids exist", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);

  db.prepare("INSERT INTO user_achievements VALUES (?, ?, ?)").run(
    "user-1",
    "first-level-up",
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO user_achievements VALUES (?, ?, ?)").run(
    "user-1",
    "first-extra-die",
    "2026-02-01T00:00:00.000Z",
  );

  assert.equal(migrateLegacyDatabaseSchema(db), true);
  initializeDatabaseSchema(db);

  assert.deepEqual(db.prepare("SELECT * FROM user_achievements WHERE user_id = ?").all("user-1"), [
    {
      user_id: "user-1",
      achievement_id: "first-extra-die",
      earned_at: "2026-01-01T00:00:00.000Z",
    },
  ]);
});

test("migrateLegacyDatabaseSchema upgrades the v1 analytics schema and backfills the active prestige row", () => {
  const db = new Database(":memory:");
  createCurrentProgressionSchemaV1(db);

  db.exec(`
    CREATE TABLE dice_prestige (
      user_id TEXT PRIMARY KEY,
      prestige INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE dice_active_prestige (
      user_id TEXT PRIMARY KEY,
      prestige INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  db.prepare("INSERT INTO dice_prestige VALUES (?, ?, ?)").run(
    "user-1",
    2,
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO dice_active_prestige VALUES (?, ?, ?)").run(
    "user-1",
    1,
    "2026-01-02T00:00:00.000Z",
  );
  db.prepare("INSERT INTO dice_counts_by_prestige VALUES (?, ?, ?, ?)").run(
    "user-1",
    1,
    8,
    "2026-01-03T00:00:00.000Z",
  );
  db.prepare("INSERT INTO dice_counts_by_prestige VALUES (?, ?, ?, ?)").run(
    "user-1",
    2,
    3,
    "2026-01-04T00:00:00.000Z",
  );
  db.prepare("INSERT INTO dice_analytics VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "user-1",
    "2026-01-05T00:00:00.000Z",
    "2026-01-06T00:00:00.000Z",
    6,
    2,
    48,
    180,
    1,
    2,
    3,
    "2026-01-07T00:00:00.000Z",
  );

  assert.equal(migrateLegacyDatabaseSchema(db), true);
  initializeDatabaseSchema(db);

  assert.equal(hasColumn(db, "dice_analytics", "total_dice_sets_rolled"), true);
  assert.equal(hasColumn(db, "dice_analytics", "total_roll_commands_called"), true);
  assert.deepEqual(db.prepare("SELECT * FROM dice_analytics WHERE user_id = ?").get("user-1"), {
    user_id: "user-1",
    dice_count_started_at: "2026-01-05T00:00:00.000Z",
    prestige_started_at: "2026-01-06T00:00:00.000Z",
    roll_sets_current_dice_count: 6,
    near_dice_count_increase_roll_sets_current_dice_count: 2,
    dice_rolled_current_prestige: 48,
    total_dice_rolled: 180,
    total_dice_sets_rolled: 0,
    total_roll_commands_called: 0,
    pvp_wins: 1,
    pvp_losses: 2,
    pvp_draws: 3,
    updated_at: "2026-01-07T00:00:00.000Z",
  });
  assert.deepEqual(
    db.prepare("SELECT * FROM dice_analytics_by_prestige WHERE user_id = ?").all("user-1"),
    [
      {
        user_id: "user-1",
        prestige: 1,
        prestige_started_at: "2026-01-06T00:00:00.000Z",
        dice_count_started_at: "2026-01-05T00:00:00.000Z",
        roll_sets_current_dice_count: 6,
        near_dice_count_increase_roll_sets_current_dice_count: 2,
        dice_rolled_current_prestige: 48,
        updated_at: "2026-01-07T00:00:00.000Z",
      },
    ],
  );
  assert.equal(db.pragma("user_version", { simple: true }), 2);
});

test("migrateLegacyDatabaseSchema rejects duplicate legacy and current progression tables", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE dice_levels_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, prestige)
    );

    CREATE TABLE dice_counts_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      dice_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, prestige)
    );
  `);

  assert.throws(
    () => migrateLegacyDatabaseSchema(db),
    /Both dice_levels_by_prestige and dice_counts_by_prestige exist/,
  );
});

test("migrateLegacyDatabaseSchema rejects mixed legacy and current columns in the same table", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE dice_counts_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      dice_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, prestige)
    );
  `);

  assert.throws(
    () => migrateLegacyDatabaseSchema(db),
    /Both dice_counts_by_prestige\.level and dice_counts_by_prestige\.dice_count exist/,
  );
});

test("migrateLegacyDatabaseSchema rejects incomplete current schema without stamping user_version", () => {
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
    () => migrateLegacyDatabaseSchema(db),
    /Current dice-count schema is incomplete or invalid/,
  );
  assert.equal(db.pragma("user_version", { simple: true }), 0);
});
