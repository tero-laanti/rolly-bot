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

const hasIndex = (db: Database.Database, indexName: string): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(indexName) as { name: string } | undefined;

  return Boolean(row);
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

const createCurrentSchemaV2 = (db: Database.Database): void => {
  initializeDatabaseSchema(db);
  db.exec("DROP TABLE dice_personal_charge_state");
  db.pragma("user_version = 2");
};

const createCurrentSchemaV4 = (db: Database.Database): void => {
  initializeDatabaseSchema(db);
  db.exec(`
    DROP TABLE dice_contract_master_initial_offers;
    DROP TABLE dice_contract_master_user_cadence_state;
    DROP TABLE dice_contract_master_runs;
    DROP TABLE dice_contract_master_reroll_usage;
  `);
  db.pragma("user_version = 4");
};

const createCurrentSchemaV5 = (db: Database.Database): void => {
  initializeDatabaseSchema(db);
  db.exec(`
    DROP INDEX IF EXISTS idx_dice_contract_master_initial_offers_contract_id;
    DROP INDEX IF EXISTS idx_dice_contract_master_runs_contract_id;

    ALTER TABLE dice_contract_master_runs RENAME TO dice_contract_master_runs_v6;

    CREATE TABLE dice_contract_master_runs (
      user_id TEXT NOT NULL,
      cadence TEXT NOT NULL,
      reset_window TEXT NOT NULL,
      sequence_number INTEGER NOT NULL,
      contract_id TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      objective_type TEXT NOT NULL,
      required_count INTEGER NOT NULL,
      current_count INTEGER NOT NULL DEFAULT 0,
      accepted_via TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      completed_at TEXT,
      reward_pips INTEGER NOT NULL DEFAULT 0,
      reward_granted_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, cadence, reset_window, sequence_number)
    );

    INSERT INTO dice_contract_master_runs (
      user_id,
      cadence,
      reset_window,
      sequence_number,
      contract_id,
      difficulty,
      objective_type,
      required_count,
      current_count,
      accepted_via,
      accepted_at,
      completed_at,
      reward_pips,
      reward_granted_at,
      updated_at
    )
    SELECT
      user_id,
      cadence,
      reset_window,
      sequence_number,
      contract_id,
      difficulty,
      objective_type,
      required_count,
      current_count,
      accepted_via,
      accepted_at,
      completed_at,
      reward_pips,
      reward_granted_at,
      updated_at
    FROM dice_contract_master_runs_v6;

    DROP TABLE dice_contract_master_runs_v6;
  `);
  db.pragma("user_version = 5");
};

const createCurrentSchemaV11 = (db: Database.Database): void => {
  initializeDatabaseSchema(db);
  db.exec(`
    DROP TABLE dice_garden_plots;
    DROP TABLE dice_garden_achievement_stats;
  `);
  db.pragma("user_version = 11");
};

test("initializeDatabaseSchema creates the current schema on an empty database", () => {
  const db = new Database(":memory:");

  initializeDatabaseSchema(db);

  assert.equal(hasTable(db, "dice_counts_by_prestige"), true);
  assert.equal(hasTable(db, "dice_analytics"), true);
  assert.equal(hasTable(db, "dice_analytics_by_prestige"), true);
  assert.equal(hasTable(db, "dice_progression_achievement_stats"), true);
  assert.equal(hasTable(db, "dice_personal_charge_state"), true);
  assert.equal(hasTable(db, "dice_garden_plots"), true);
  assert.equal(hasTable(db, "dice_garden_achievement_stats"), true);
  assert.equal(hasTable(db, "dice_contract_master_initial_offers"), true);
  assert.equal(hasTable(db, "dice_contract_master_user_cadence_state"), true);
  assert.equal(hasTable(db, "dice_contract_master_runs"), true);
  assert.equal(hasTable(db, "dice_contract_master_reroll_usage"), true);
  assert.equal(hasColumn(db, "dice_contract_master_runs", "contract_title"), true);
  assert.equal(hasColumn(db, "dice_contract_master_runs", "contract_description"), true);
  assert.equal(hasTable(db, "dice_raid_runs"), true);
  assert.equal(hasTable(db, "dice_raid_run_members"), true);
  assert.equal(hasTable(db, "dice_raid_tier_first_clears"), true);
  assert.equal(hasTable(db, "dice_world_boss_double_roll_rush_zones"), true);
  assert.equal(hasColumn(db, "dice_raid_runs", "is_open"), true);
  assert.equal(hasColumn(db, "dice_raid_runs", "encounter_message_id"), true);
  assert.equal(hasColumn(db, "dice_raid_runs", "boss_current_hp"), true);
  assert.equal(hasColumn(db, "dice_raid_runs", "reward_granted_at"), true);
  assert.equal(hasColumn(db, "dice_raid_runs", "reward_summary"), true);
  assert.equal(hasColumn(db, "dice_raid_runs", "close_scheduled_at"), true);
  assert.equal(hasColumn(db, "dice_raid_run_members", "active"), true);
  assert.equal(hasColumn(db, "dice_world_boss_double_roll_rush_zones", "close_reason"), true);
  assert.equal(hasIndex(db, "idx_dice_contract_master_initial_offers_contract_id"), true);
  assert.equal(hasIndex(db, "idx_dice_contract_master_runs_contract_id"), true);
  assert.equal(hasIndex(db, "idx_dice_raid_runs_status_created_at"), true);
  assert.equal(hasIndex(db, "idx_dice_raid_runs_is_open_created_at"), true);
  assert.equal(hasIndex(db, "idx_dice_raid_run_members_active_user_id"), true);
  assert.equal(hasIndex(db, "idx_dice_raid_tier_first_clears_tier_id"), true);
  assert.equal(hasIndex(db, "idx_dice_world_boss_double_roll_rush_source_world_boss_id"), true);
  assert.equal(hasIndex(db, "idx_dice_world_boss_double_roll_rush_channel_id"), true);
  assert.equal(hasIndex(db, "idx_dice_world_boss_double_roll_rush_open_expires_at"), true);
  assert.equal(hasColumn(db, "dice_analytics", "total_dice_sets_rolled"), true);
  assert.equal(hasColumn(db, "dice_analytics", "total_roll_commands_called"), true);
  assert.equal(hasColumn(db, "dice_analytics_by_prestige", "prestige_started_at"), true);
  assert.equal(db.pragma("user_version", { simple: true }), 12);
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

test("initializeDatabaseSchema adds the personal charge table on the supported v2 schema", () => {
  const db = new Database(":memory:");
  createCurrentSchemaV2(db);
  db.prepare(
    `
    INSERT INTO balances (user_id, fame, pips, updated_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run("user-1", 7, 11, "2026-03-27T12:00:00.000Z");

  initializeDatabaseSchema(db);

  assert.equal(hasTable(db, "dice_personal_charge_state"), true);
  assert.equal(hasTable(db, "dice_garden_plots"), true);
  assert.equal(hasTable(db, "dice_garden_achievement_stats"), true);
  assert.equal(hasTable(db, "dice_contract_master_runs"), true);
  assert.equal(hasColumn(db, "dice_contract_master_runs", "contract_title"), true);
  assert.equal(db.pragma("user_version", { simple: true }), 12);
  assert.deepEqual(db.prepare("SELECT fame, pips FROM balances WHERE user_id = ?").get("user-1"), {
    fame: 7,
    pips: 11,
  });
});

test("initializeDatabaseSchema adds garden tables on the supported v11 schema", () => {
  const db = new Database(":memory:");
  createCurrentSchemaV11(db);

  initializeDatabaseSchema(db);

  assert.equal(hasTable(db, "dice_garden_plots"), true);
  assert.equal(hasTable(db, "dice_garden_achievement_stats"), true);
  assert.equal(db.pragma("user_version", { simple: true }), 12);
});

test("initializeDatabaseSchema resets legacy contracts rows and adds contract master tables during v5 rollout", () => {
  const db = new Database(":memory:");
  createCurrentSchemaV4(db);

  db.prepare(
    `
    INSERT INTO dice_contract_rotations (cadence, period_key, contract_ids_json, reset_at, activated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    "daily",
    "2026-03-28",
    JSON.stringify(["daily-roll"]),
    "2026-03-29T00:00:00.000Z",
    "2026-03-28T10:00:00.000Z",
    "2026-03-28T10:00:00.000Z",
  );
  db.prepare(
    `
    INSERT INTO dice_contract_progress (
      user_id,
      contract_id,
      cadence,
      period_key,
      objective_type,
      required_count,
      current_count,
      completed_at,
      rewarded_at,
      reward_pips,
      reward_fame,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    "user-1",
    "daily-roll",
    "daily",
    "2026-03-28",
    "roll_count",
    10,
    5,
    null,
    null,
    10,
    2,
    "2026-03-28T10:00:00.000Z",
  );

  initializeDatabaseSchema(db);

  assert.equal(hasTable(db, "dice_contract_master_initial_offers"), true);
  assert.equal(hasTable(db, "dice_contract_master_user_cadence_state"), true);
  assert.equal(hasTable(db, "dice_contract_master_runs"), true);
  assert.equal(hasTable(db, "dice_contract_master_reroll_usage"), true);
  assert.deepEqual(
    db.prepare("SELECT COUNT(*) AS count FROM dice_contract_rotations").get() as { count: number },
    { count: 0 },
  );
  assert.deepEqual(
    db.prepare("SELECT COUNT(*) AS count FROM dice_contract_progress").get() as { count: number },
    { count: 0 },
  );
  assert.equal(hasColumn(db, "dice_contract_master_runs", "contract_title"), true);
  assert.equal(db.pragma("user_version", { simple: true }), 12);
});

test("initializeDatabaseSchema upgrades v5 contract master runs with metadata columns and unique indexes", () => {
  const db = new Database(":memory:");
  createCurrentSchemaV5(db);

  db.prepare(
    `
    INSERT INTO dice_contract_master_runs (
      user_id,
      cadence,
      reset_window,
      sequence_number,
      contract_id,
      difficulty,
      objective_type,
      required_count,
      current_count,
      accepted_via,
      accepted_at,
      completed_at,
      reward_pips,
      reward_granted_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    "user-1",
    "daily",
    "2026-03-28",
    1,
    "daily-simple-a",
    "simple",
    "roll_count",
    5,
    2,
    "initial",
    "2026-03-28T10:00:00.000Z",
    null,
    15,
    null,
    "2026-03-28T10:00:00.000Z",
  );

  initializeDatabaseSchema(db);

  assert.equal(hasColumn(db, "dice_contract_master_runs", "contract_title"), true);
  assert.equal(hasColumn(db, "dice_contract_master_runs", "contract_description"), true);
  assert.equal(hasIndex(db, "idx_dice_contract_master_initial_offers_contract_id"), true);
  assert.equal(hasIndex(db, "idx_dice_contract_master_runs_contract_id"), true);
  assert.deepEqual(
    db
      .prepare(
        `
        SELECT contract_title, contract_description
        FROM dice_contract_master_runs
        WHERE user_id = ? AND cadence = ? AND reset_window = ? AND sequence_number = ?
      `,
      )
      .get("user-1", "daily", "2026-03-28", 1),
    { contract_title: "", contract_description: "" },
  );
  assert.equal(db.pragma("user_version", { simple: true }), 12);
});

test("initializeDatabaseSchema migrates legacy world boss stats and persisted source ids", () => {
  const db = new Database(":memory:");
  createCurrentSchemaV2(db);

  db.exec(`
    CREATE TABLE dice_raid_achievement_stats (
      user_id TEXT PRIMARY KEY,
      joined_count INTEGER NOT NULL DEFAULT 0,
      hit_count INTEGER NOT NULL DEFAULT 0,
      eligible_clear_count INTEGER NOT NULL DEFAULT 0,
      top_damage_clear_count INTEGER NOT NULL DEFAULT 0,
      lifetime_damage INTEGER NOT NULL DEFAULT 0,
      highest_cleared_boss_level INTEGER NOT NULL DEFAULT 0,
      tourist_success_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  db.prepare(
    `
    INSERT INTO dice_raid_achievement_stats (
      user_id,
      joined_count,
      hit_count,
      eligible_clear_count,
      top_damage_clear_count,
      lifetime_damage,
      highest_cleared_boss_level,
      tourist_success_count,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run("user-1", 2, 3, 4, 1, 500, 12, 1, "2026-03-28T10:00:00.000Z");
  db.prepare(
    `
    INSERT INTO dice_temporary_effects (
      id,
      user_id,
      effect_code,
      kind,
      source,
      magnitude,
      remaining_rolls,
      expires_at,
      consume_on_command,
      stack_group,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    "effect-1",
    "user-1",
    "roll-pass-multiplier",
    "positive",
    "raid:legacy-boss-1",
    2,
    3,
    null,
    "dice",
    "world-boss-reward-roll-pass-multiplier",
    "2026-03-28T10:00:00.000Z",
    "2026-03-28T10:00:00.000Z",
  );

  initializeDatabaseSchema(db);

  assert.equal(hasTable(db, "dice_raid_achievement_stats"), false);
  assert.deepEqual(
    db
      .prepare(
        `
      SELECT joined_count, hit_count, eligible_clear_count, top_damage_clear_count, lifetime_damage,
             highest_cleared_boss_level, tourist_success_count
      FROM dice_world_boss_achievement_stats
      WHERE user_id = ?
    `,
      )
      .get("user-1"),
    {
      joined_count: 2,
      hit_count: 3,
      eligible_clear_count: 4,
      top_damage_clear_count: 1,
      lifetime_damage: 500,
      highest_cleared_boss_level: 12,
      tourist_success_count: 1,
    },
  );
  assert.deepEqual(
    db.prepare("SELECT source FROM dice_temporary_effects WHERE id = ?").get("effect-1"),
    { source: "world-boss:legacy-boss-1" },
  );
});
