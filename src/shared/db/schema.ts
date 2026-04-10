import type { SqliteDatabase } from "../db";

const currentSchemaVersion = 12;

const schemaVersion2Columns = new Map<string, string[]>([
  [
    "balances",
    ["user_id", "fame", "pips", "last_daily_pip_reward_at", "fame_updated_at", "updated_at"],
  ],
  ["inventory_items", ["user_id", "item_id", "quantity", "first_acquired_at", "updated_at"]],
  ["dice_counts_by_prestige", ["user_id", "prestige", "dice_count", "updated_at"]],
  ["user_achievements", ["user_id", "achievement_id", "earned_at"]],
  ["dice_bans", ["user_id", "die_index", "banned_value", "updated_at"]],
  ["dice_prestige", ["user_id", "prestige", "updated_at"]],
  ["dice_active_prestige", ["user_id", "prestige", "updated_at"]],
  ["dice_pvp_effects", ["user_id", "lockout_until", "double_roll_until", "updated_at"]],
  [
    "dice_pvp_challenges",
    [
      "id",
      "challenger_id",
      "opponent_id",
      "duel_tier",
      "wager_pips",
      "status",
      "created_at",
      "expires_at",
      "updated_at",
    ],
  ],
  [
    "dice_analytics",
    [
      "user_id",
      "dice_count_started_at",
      "prestige_started_at",
      "roll_sets_current_dice_count",
      "near_dice_count_increase_roll_sets_current_dice_count",
      "dice_rolled_current_prestige",
      "total_dice_rolled",
      "total_dice_sets_rolled",
      "total_roll_commands_called",
      "pvp_wins",
      "pvp_losses",
      "pvp_draws",
      "updated_at",
    ],
  ],
  [
    "dice_analytics_by_prestige",
    [
      "user_id",
      "prestige",
      "prestige_started_at",
      "dice_count_started_at",
      "roll_sets_current_dice_count",
      "near_dice_count_increase_roll_sets_current_dice_count",
      "dice_rolled_current_prestige",
      "updated_at",
    ],
  ],
  ["dice_charge_state", ["id", "last_roll_at", "updated_at"]],
  [
    "dice_temporary_effects",
    [
      "id",
      "user_id",
      "effect_code",
      "kind",
      "source",
      "magnitude",
      "remaining_rolls",
      "expires_at",
      "consume_on_command",
      "stack_group",
      "created_at",
      "updated_at",
    ],
  ],
  [
    "dice_casino_sessions",
    ["user_id", "bet", "game", "state_json", "status", "expires_at", "updated_at"],
  ],
  [
    "dice_casino_analytics",
    [
      "user_id",
      "game",
      "bet_tier",
      "rounds_started",
      "rounds_completed",
      "wins",
      "losses",
      "pushes",
      "total_wagered",
      "total_paid_out",
      "largest_payout",
      "updated_at",
    ],
  ],
  [
    "dice_progression_achievement_stats",
    [
      "user_id",
      "roll_commands_total",
      "near_dice_count_increase_rolls_total",
      "highest_charge_multiplier",
      "highest_roll_pass_count",
      "dice_count_increases_total",
      "first_ban_at",
      "updated_at",
    ],
  ],
  [
    "dice_casino_achievement_stats",
    [
      "user_id",
      "rounds_completed_total",
      "total_wagered",
      "highest_payout",
      "exact_face_wins",
      "high_low_wins",
      "push_cashouts",
      "push_perfect_runs",
      "blackjack_naturals",
      "blackjack_pushes",
      "blackjack_hit_to_21_wins",
      "poker_straights",
      "poker_full_houses",
      "poker_four_of_a_kind",
      "poker_five_of_a_kind",
      "played_exact_roll",
      "played_push_your_luck",
      "played_blackjack",
      "played_dice_poker",
      "updated_at",
    ],
  ],
  [
    "dice_pvp_achievement_stats",
    [
      "user_id",
      "duels_total",
      "current_win_streak",
      "highest_win_streak",
      "highest_tier_win",
      "updated_at",
    ],
  ],
  [
    "dice_random_event_achievement_stats",
    [
      "user_id",
      "success_count",
      "failure_count",
      "multi_user_success_count",
      "legendary_success_count",
      "lockout_count",
      "keep_open_comeback_count",
      "negative_effect_expires_at",
      "updated_at",
    ],
  ],
  [
    "dice_world_boss_achievement_stats",
    [
      "user_id",
      "joined_count",
      "hit_count",
      "eligible_clear_count",
      "top_damage_clear_count",
      "lifetime_damage",
      "highest_cleared_boss_level",
      "tourist_success_count",
      "updated_at",
    ],
  ],
  [
    "dice_item_achievement_stats",
    [
      "user_id",
      "shop_purchase_count",
      "item_use_count",
      "used_trigger_random_group_event",
      "used_auto_roll_item",
      "used_cleanse_item",
      "updated_at",
    ],
  ],
  ["managed_intro_posts", ["slot_index", "channel_id", "message_id", "created_at", "updated_at"]],
]);

const currentSchemaColumns = new Map<string, string[]>([
  ...schemaVersion2Columns,
  ["dice_personal_charge_state", ["user_id", "last_roll_at", "updated_at"]],
  [
    "dice_garden_plots",
    ["user_id", "slot_index", "seed_item_id", "die_sides", "planted_at", "ready_at", "updated_at"],
  ],
  [
    "dice_garden_achievement_stats",
    ["user_id", "planted_seed_count", "harvested_seed_count", "harvested_d12_count", "updated_at"],
  ],
  [
    "dice_contract_rotations",
    ["cadence", "period_key", "contract_ids_json", "reset_at", "activated_at", "updated_at"],
  ],
  [
    "dice_contract_progress",
    [
      "user_id",
      "contract_id",
      "cadence",
      "period_key",
      "objective_type",
      "required_count",
      "current_count",
      "completed_at",
      "rewarded_at",
      "reward_pips",
      "reward_fame",
      "updated_at",
    ],
  ],
  [
    "dice_contract_master_initial_offers",
    ["cadence", "difficulty", "reset_window", "contract_id", "created_at", "updated_at"],
  ],
  [
    "dice_contract_master_user_cadence_state",
    [
      "user_id",
      "cadence",
      "reset_window",
      "completion_count",
      "refill_available_difficulty",
      "refill_claimed_at",
      "last_completed_at",
      "updated_at",
    ],
  ],
  [
    "dice_contract_master_runs",
    [
      "user_id",
      "cadence",
      "reset_window",
      "sequence_number",
      "contract_id",
      "contract_title",
      "contract_description",
      "difficulty",
      "objective_type",
      "required_count",
      "current_count",
      "accepted_via",
      "accepted_at",
      "completed_at",
      "reward_pips",
      "reward_granted_at",
      "updated_at",
    ],
  ],
  [
    "dice_contract_master_reroll_usage",
    ["user_id", "cadence", "reset_window", "difficulty", "used_at", "updated_at"],
  ],
  [
    "dice_raid_runs",
    [
      "run_id",
      "tier_id",
      "boss_id",
      "leader_user_id",
      "status",
      "is_open",
      "public_channel_id",
      "public_message_id",
      "private_channel_id",
      "participant_role_id",
      "encounter_message_id",
      "recruitment_expires_at",
      "encounter_starts_at",
      "encounter_expires_at",
      "boss_current_hp",
      "reward_granted_at",
      "reward_summary",
      "close_scheduled_at",
      "version",
      "created_at",
      "updated_at",
    ],
  ],
  [
    "dice_raid_run_members",
    ["run_id", "user_id", "is_leader", "active", "joined_at", "updated_at"],
  ],
  [
    "dice_world_boss_double_roll_rush_zones",
    [
      "rush_id",
      "source_world_boss_id",
      "parent_channel_id",
      "rush_channel_id",
      "kickoff_message_id",
      "activated_at",
      "expires_at",
      "closed_at",
      "close_reason",
      "created_at",
      "updated_at",
    ],
  ],
]);

const ensureWorldBossAchievementStatsTable = (db: SqliteDatabase): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dice_world_boss_achievement_stats (
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
};

const migrateLegacyWorldBossPersistence = (db: SqliteDatabase): void => {
  if (hasTable(db, "dice_raid_achievement_stats")) {
    ensureWorldBossAchievementStatsTable(db);
    db.exec(`
      INSERT OR IGNORE INTO dice_world_boss_achievement_stats (
        user_id,
        joined_count,
        hit_count,
        eligible_clear_count,
        top_damage_clear_count,
        lifetime_damage,
        highest_cleared_boss_level,
        tourist_success_count,
        updated_at
      )
      SELECT
        user_id,
        joined_count,
        hit_count,
        eligible_clear_count,
        top_damage_clear_count,
        lifetime_damage,
        highest_cleared_boss_level,
        tourist_success_count,
        updated_at
      FROM dice_raid_achievement_stats;

      UPDATE dice_world_boss_achievement_stats
      SET
        joined_count = MAX(
          joined_count,
          COALESCE(
            (SELECT joined_count FROM dice_raid_achievement_stats WHERE user_id = dice_world_boss_achievement_stats.user_id),
            joined_count
          )
        ),
        hit_count = MAX(
          hit_count,
          COALESCE(
            (SELECT hit_count FROM dice_raid_achievement_stats WHERE user_id = dice_world_boss_achievement_stats.user_id),
            hit_count
          )
        ),
        eligible_clear_count = MAX(
          eligible_clear_count,
          COALESCE(
            (SELECT eligible_clear_count FROM dice_raid_achievement_stats WHERE user_id = dice_world_boss_achievement_stats.user_id),
            eligible_clear_count
          )
        ),
        top_damage_clear_count = MAX(
          top_damage_clear_count,
          COALESCE(
            (SELECT top_damage_clear_count FROM dice_raid_achievement_stats WHERE user_id = dice_world_boss_achievement_stats.user_id),
            top_damage_clear_count
          )
        ),
        lifetime_damage = MAX(
          lifetime_damage,
          COALESCE(
            (SELECT lifetime_damage FROM dice_raid_achievement_stats WHERE user_id = dice_world_boss_achievement_stats.user_id),
            lifetime_damage
          )
        ),
        highest_cleared_boss_level = MAX(
          highest_cleared_boss_level,
          COALESCE(
            (SELECT highest_cleared_boss_level FROM dice_raid_achievement_stats WHERE user_id = dice_world_boss_achievement_stats.user_id),
            highest_cleared_boss_level
          )
        ),
        tourist_success_count = MAX(
          tourist_success_count,
          COALESCE(
            (SELECT tourist_success_count FROM dice_raid_achievement_stats WHERE user_id = dice_world_boss_achievement_stats.user_id),
            tourist_success_count
          )
        ),
        updated_at = MAX(
          updated_at,
          COALESCE(
            (SELECT updated_at FROM dice_raid_achievement_stats WHERE user_id = dice_world_boss_achievement_stats.user_id),
            updated_at
          )
        );

      DROP TABLE dice_raid_achievement_stats;
    `);
  }

  if (hasColumn(db, "dice_temporary_effects", "source")) {
    db.exec(`
      UPDATE dice_temporary_effects
      SET source = 'world-boss:' || substr(source, 6)
      WHERE source LIKE 'raid:%'
    `);
  }
};

export const initializeDatabaseSchema = (db: SqliteDatabase): void => {
  const previousSchemaVersion = Number(db.pragma("user_version", { simple: true }) ?? 0);
  if (hasExistingUserTables(db)) {
    migrateLegacyWorldBossPersistence(db);
    assertSchemaArtifacts(db, schemaVersion2Columns);
    createAdditiveSchemaArtifacts(db);
    resetLegacyContractsStateForContractMaster(db, previousSchemaVersion);
    assertCurrentSchemaArtifacts(db);
    db.pragma(`user_version = ${currentSchemaVersion}`);
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS balances (
      user_id TEXT PRIMARY KEY,
      fame INTEGER NOT NULL DEFAULT 0,
      pips INTEGER NOT NULL DEFAULT 0,
      last_daily_pip_reward_at TEXT,
      fame_updated_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      first_acquired_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS dice_counts_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      dice_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, prestige)
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS dice_bans (
      user_id TEXT NOT NULL,
      die_index INTEGER NOT NULL,
      banned_value INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, die_index, banned_value)
    );

    CREATE TABLE IF NOT EXISTS dice_prestige (
      user_id TEXT PRIMARY KEY,
      prestige INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_active_prestige (
      user_id TEXT PRIMARY KEY,
      prestige INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_pvp_effects (
      user_id TEXT PRIMARY KEY,
      lockout_until TEXT,
      double_roll_until TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_pvp_challenges (
      id TEXT PRIMARY KEY,
      challenger_id TEXT NOT NULL,
      opponent_id TEXT NOT NULL,
      duel_tier INTEGER NOT NULL,
      wager_pips INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_analytics (
      user_id TEXT PRIMARY KEY,
      dice_count_started_at TEXT NOT NULL,
      prestige_started_at TEXT NOT NULL,
      roll_sets_current_dice_count INTEGER NOT NULL DEFAULT 0,
      near_dice_count_increase_roll_sets_current_dice_count INTEGER NOT NULL DEFAULT 0,
      dice_rolled_current_prestige INTEGER NOT NULL DEFAULT 0,
      total_dice_rolled INTEGER NOT NULL DEFAULT 0,
      total_dice_sets_rolled INTEGER NOT NULL DEFAULT 0,
      total_roll_commands_called INTEGER NOT NULL DEFAULT 0,
      pvp_wins INTEGER NOT NULL DEFAULT 0,
      pvp_losses INTEGER NOT NULL DEFAULT 0,
      pvp_draws INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_analytics_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      prestige_started_at TEXT NOT NULL,
      dice_count_started_at TEXT NOT NULL,
      roll_sets_current_dice_count INTEGER NOT NULL DEFAULT 0,
      near_dice_count_increase_roll_sets_current_dice_count INTEGER NOT NULL DEFAULT 0,
      dice_rolled_current_prestige INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, prestige)
    );

    CREATE TABLE IF NOT EXISTS dice_charge_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_roll_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_personal_charge_state (
      user_id TEXT PRIMARY KEY,
      last_roll_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_garden_plots (
      user_id TEXT NOT NULL,
      slot_index INTEGER NOT NULL,
      seed_item_id TEXT NOT NULL,
      die_sides INTEGER NOT NULL,
      planted_at TEXT NOT NULL,
      ready_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, slot_index)
    );

    CREATE TABLE IF NOT EXISTS dice_garden_achievement_stats (
      user_id TEXT PRIMARY KEY,
      planted_seed_count INTEGER NOT NULL DEFAULT 0,
      harvested_seed_count INTEGER NOT NULL DEFAULT 0,
      harvested_d12_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_temporary_effects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      effect_code TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('positive', 'negative')),
      source TEXT NOT NULL,
      magnitude INTEGER NOT NULL DEFAULT 1,
      remaining_rolls INTEGER,
      expires_at TEXT,
      consume_on_command TEXT NOT NULL DEFAULT 'dice',
      stack_group TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dice_temporary_effects_user_id
      ON dice_temporary_effects (user_id);

    CREATE INDEX IF NOT EXISTS idx_dice_temporary_effects_user_stack_group
      ON dice_temporary_effects (user_id, stack_group);

    CREATE TABLE IF NOT EXISTS dice_casino_sessions (
      user_id TEXT PRIMARY KEY,
      bet INTEGER NOT NULL CHECK (bet >= 1),
      game TEXT NOT NULL,
      state_json TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_casino_analytics (
      user_id TEXT NOT NULL,
      game TEXT NOT NULL,
      bet_tier TEXT NOT NULL,
      rounds_started INTEGER NOT NULL DEFAULT 0,
      rounds_completed INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      pushes INTEGER NOT NULL DEFAULT 0,
      total_wagered INTEGER NOT NULL DEFAULT 0,
      total_paid_out INTEGER NOT NULL DEFAULT 0,
      largest_payout INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, game, bet_tier)
    );

    CREATE TABLE IF NOT EXISTS dice_progression_achievement_stats (
      user_id TEXT PRIMARY KEY,
      roll_commands_total INTEGER NOT NULL DEFAULT 0,
      near_dice_count_increase_rolls_total INTEGER NOT NULL DEFAULT 0,
      highest_charge_multiplier INTEGER NOT NULL DEFAULT 1,
      highest_roll_pass_count INTEGER NOT NULL DEFAULT 1,
      dice_count_increases_total INTEGER NOT NULL DEFAULT 0,
      first_ban_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_casino_achievement_stats (
      user_id TEXT PRIMARY KEY,
      rounds_completed_total INTEGER NOT NULL DEFAULT 0,
      total_wagered INTEGER NOT NULL DEFAULT 0,
      highest_payout INTEGER NOT NULL DEFAULT 0,
      exact_face_wins INTEGER NOT NULL DEFAULT 0,
      high_low_wins INTEGER NOT NULL DEFAULT 0,
      push_cashouts INTEGER NOT NULL DEFAULT 0,
      push_perfect_runs INTEGER NOT NULL DEFAULT 0,
      blackjack_naturals INTEGER NOT NULL DEFAULT 0,
      blackjack_pushes INTEGER NOT NULL DEFAULT 0,
      blackjack_hit_to_21_wins INTEGER NOT NULL DEFAULT 0,
      poker_straights INTEGER NOT NULL DEFAULT 0,
      poker_full_houses INTEGER NOT NULL DEFAULT 0,
      poker_four_of_a_kind INTEGER NOT NULL DEFAULT 0,
      poker_five_of_a_kind INTEGER NOT NULL DEFAULT 0,
      played_exact_roll INTEGER NOT NULL DEFAULT 0,
      played_push_your_luck INTEGER NOT NULL DEFAULT 0,
      played_blackjack INTEGER NOT NULL DEFAULT 0,
      played_dice_poker INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_pvp_achievement_stats (
      user_id TEXT PRIMARY KEY,
      duels_total INTEGER NOT NULL DEFAULT 0,
      current_win_streak INTEGER NOT NULL DEFAULT 0,
      highest_win_streak INTEGER NOT NULL DEFAULT 0,
      highest_tier_win INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_random_event_achievement_stats (
      user_id TEXT PRIMARY KEY,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      multi_user_success_count INTEGER NOT NULL DEFAULT 0,
      legendary_success_count INTEGER NOT NULL DEFAULT 0,
      lockout_count INTEGER NOT NULL DEFAULT 0,
      keep_open_comeback_count INTEGER NOT NULL DEFAULT 0,
      negative_effect_expires_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_world_boss_achievement_stats (
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

    CREATE TABLE IF NOT EXISTS dice_item_achievement_stats (
      user_id TEXT PRIMARY KEY,
      shop_purchase_count INTEGER NOT NULL DEFAULT 0,
      item_use_count INTEGER NOT NULL DEFAULT 0,
      used_trigger_random_group_event INTEGER NOT NULL DEFAULT 0,
      used_auto_roll_item INTEGER NOT NULL DEFAULT 0,
      used_cleanse_item INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managed_intro_posts (
      slot_index INTEGER PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  createAdditiveSchemaArtifacts(db);
  resetLegacyContractsStateForContractMaster(db, previousSchemaVersion);
  assertCurrentSchemaArtifacts(db);
  db.pragma(`user_version = ${currentSchemaVersion}`);
};

const assertCurrentSchemaArtifacts = (db: SqliteDatabase): void => {
  const issues = getSchemaIssues(db, currentSchemaColumns);
  if (issues.length < 1) {
    return;
  }

  throw buildSchemaError("Database schema is incomplete or outdated for this build.", issues);
};

const assertSchemaArtifacts = (db: SqliteDatabase, schemaColumns: Map<string, string[]>): void => {
  const issues = getSchemaIssues(db, schemaColumns);
  if (issues.length < 1) {
    return;
  }

  throw buildSchemaError("Database schema is incomplete or outdated for this build.", issues);
};

const getSchemaIssues = (db: SqliteDatabase, schemaColumns: Map<string, string[]>): string[] => {
  const issues: string[] = [];

  for (const [tableName, columnNames] of schemaColumns) {
    if (!hasTable(db, tableName)) {
      issues.push(`Missing current table ${tableName}.`);
      continue;
    }

    for (const columnName of columnNames) {
      if (!hasColumn(db, tableName, columnName)) {
        issues.push(`Missing current column ${tableName}.${columnName}.`);
      }
    }
  }

  return issues;
};

const createAdditiveSchemaArtifacts = (db: SqliteDatabase): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dice_personal_charge_state (
      user_id TEXT PRIMARY KEY,
      last_roll_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_garden_plots (
      user_id TEXT NOT NULL,
      slot_index INTEGER NOT NULL,
      seed_item_id TEXT NOT NULL,
      die_sides INTEGER NOT NULL,
      planted_at TEXT NOT NULL,
      ready_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, slot_index)
    );

    CREATE TABLE IF NOT EXISTS dice_garden_achievement_stats (
      user_id TEXT PRIMARY KEY,
      planted_seed_count INTEGER NOT NULL DEFAULT 0,
      harvested_seed_count INTEGER NOT NULL DEFAULT 0,
      harvested_d12_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_contract_rotations (
      cadence TEXT NOT NULL,
      period_key TEXT NOT NULL,
      contract_ids_json TEXT NOT NULL,
      reset_at TEXT NOT NULL,
      activated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (cadence, period_key)
    );

    CREATE TABLE IF NOT EXISTS dice_contract_progress (
      user_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      cadence TEXT NOT NULL,
      period_key TEXT NOT NULL,
      objective_type TEXT NOT NULL,
      required_count INTEGER NOT NULL,
      current_count INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      rewarded_at TEXT,
      reward_pips INTEGER NOT NULL DEFAULT 0,
      reward_fame INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, contract_id, cadence, period_key)
    );

    CREATE TABLE IF NOT EXISTS dice_contract_master_initial_offers (
      cadence TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      reset_window TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (cadence, difficulty, reset_window)
    );

    CREATE INDEX IF NOT EXISTS idx_dice_contract_master_initial_offers_reset_window
      ON dice_contract_master_initial_offers (cadence, reset_window);

    CREATE TABLE IF NOT EXISTS dice_contract_master_user_cadence_state (
      user_id TEXT NOT NULL,
      cadence TEXT NOT NULL,
      reset_window TEXT NOT NULL,
      completion_count INTEGER NOT NULL DEFAULT 0,
      refill_available_difficulty TEXT,
      refill_claimed_at TEXT,
      last_completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, cadence, reset_window)
    );

    CREATE TABLE IF NOT EXISTS dice_contract_master_runs (
      user_id TEXT NOT NULL,
      cadence TEXT NOT NULL,
      reset_window TEXT NOT NULL,
      sequence_number INTEGER NOT NULL,
      contract_id TEXT NOT NULL,
      contract_title TEXT NOT NULL,
      contract_description TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_dice_contract_master_runs_user_reset_window
      ON dice_contract_master_runs (user_id, cadence, reset_window);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dice_contract_master_initial_offers_contract_id
      ON dice_contract_master_initial_offers (cadence, reset_window, contract_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dice_contract_master_runs_contract_id
      ON dice_contract_master_runs (user_id, cadence, reset_window, contract_id);

    CREATE TABLE IF NOT EXISTS dice_contract_master_reroll_usage (
      user_id TEXT NOT NULL,
      cadence TEXT NOT NULL,
      reset_window TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      used_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, cadence, reset_window, difficulty)
    );

    CREATE TABLE IF NOT EXISTS dice_raid_runs (
      run_id TEXT PRIMARY KEY,
      tier_id TEXT NOT NULL,
      boss_id TEXT NOT NULL,
      leader_user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN (
          'recruiting',
          'provisioning',
          'provisioned',
          'active',
          'resolved',
          'cancelled',
          'expired',
          'interrupted',
          'provision-failed'
        )
      ),
      is_open INTEGER NOT NULL CHECK (is_open IN (0, 1)),
      public_channel_id TEXT NOT NULL,
      public_message_id TEXT,
      private_channel_id TEXT,
      participant_role_id TEXT,
      encounter_message_id TEXT,
      recruitment_expires_at TEXT NOT NULL,
      encounter_starts_at TEXT,
      encounter_expires_at TEXT,
      boss_current_hp INTEGER,
      reward_granted_at TEXT,
      reward_summary TEXT,
      close_scheduled_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dice_raid_runs_status_created_at
      ON dice_raid_runs (status, created_at);

    CREATE INDEX IF NOT EXISTS idx_dice_raid_runs_is_open_created_at
      ON dice_raid_runs (is_open, created_at);

    CREATE TABLE IF NOT EXISTS dice_raid_run_members (
      run_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_leader INTEGER NOT NULL CHECK (is_leader IN (0, 1)),
      active INTEGER NOT NULL CHECK (active IN (0, 1)),
      joined_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (run_id, user_id),
      FOREIGN KEY (run_id) REFERENCES dice_raid_runs(run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_dice_raid_run_members_run_id
      ON dice_raid_run_members (run_id, active, joined_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dice_raid_run_members_active_user_id
      ON dice_raid_run_members (user_id)
      WHERE active = 1;

    CREATE TABLE IF NOT EXISTS dice_raid_tier_first_clears (
      user_id TEXT NOT NULL,
      tier_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      cleared_at TEXT NOT NULL,
      PRIMARY KEY (user_id, tier_id),
      FOREIGN KEY (run_id) REFERENCES dice_raid_runs(run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_dice_raid_tier_first_clears_tier_id
      ON dice_raid_tier_first_clears (tier_id, cleared_at, user_id);

    CREATE TABLE IF NOT EXISTS dice_world_boss_double_roll_rush_zones (
      rush_id TEXT PRIMARY KEY,
      source_world_boss_id TEXT NOT NULL,
      parent_channel_id TEXT NOT NULL,
      rush_channel_id TEXT NOT NULL,
      kickoff_message_id TEXT NOT NULL,
      activated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      closed_at TEXT,
      close_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dice_world_boss_double_roll_rush_source_world_boss_id
      ON dice_world_boss_double_roll_rush_zones (source_world_boss_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dice_world_boss_double_roll_rush_channel_id
      ON dice_world_boss_double_roll_rush_zones (rush_channel_id);

    CREATE INDEX IF NOT EXISTS idx_dice_world_boss_double_roll_rush_open_expires_at
      ON dice_world_boss_double_roll_rush_zones (closed_at, expires_at, activated_at);
  `);

  if (!hasColumn(db, "dice_contract_master_runs", "contract_title")) {
    db.exec(`
      ALTER TABLE dice_contract_master_runs
      ADD COLUMN contract_title TEXT NOT NULL DEFAULT '';
    `);
  }

  if (!hasColumn(db, "dice_contract_master_runs", "contract_description")) {
    db.exec(`
      ALTER TABLE dice_contract_master_runs
      ADD COLUMN contract_description TEXT NOT NULL DEFAULT '';
    `);
  }

  if (!hasColumn(db, "dice_raid_runs", "encounter_message_id")) {
    db.exec(`
      ALTER TABLE dice_raid_runs
      ADD COLUMN encounter_message_id TEXT;
    `);
  }

  if (!hasColumn(db, "dice_raid_runs", "boss_current_hp")) {
    db.exec(`
      ALTER TABLE dice_raid_runs
      ADD COLUMN boss_current_hp INTEGER;
    `);
  }

  if (!hasColumn(db, "dice_raid_runs", "close_scheduled_at")) {
    db.exec(`
      ALTER TABLE dice_raid_runs
      ADD COLUMN close_scheduled_at TEXT;
    `);
  }

  if (!hasColumn(db, "dice_raid_runs", "reward_granted_at")) {
    db.exec(`
      ALTER TABLE dice_raid_runs
      ADD COLUMN reward_granted_at TEXT;
    `);
  }

  if (!hasColumn(db, "dice_raid_runs", "reward_summary")) {
    db.exec(`
      ALTER TABLE dice_raid_runs
      ADD COLUMN reward_summary TEXT;
    `);
  }

  if (!hasTable(db, "dice_raid_tier_first_clears")) {
    db.exec(`
      CREATE TABLE dice_raid_tier_first_clears (
        user_id TEXT NOT NULL,
        tier_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        cleared_at TEXT NOT NULL,
        PRIMARY KEY (user_id, tier_id),
        FOREIGN KEY (run_id) REFERENCES dice_raid_runs(run_id) ON DELETE CASCADE
      );
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dice_raid_tier_first_clears_tier_id
      ON dice_raid_tier_first_clears (tier_id, cleared_at, user_id);
  `);

  if (!hasTable(db, "dice_world_boss_double_roll_rush_zones")) {
    db.exec(`
      CREATE TABLE dice_world_boss_double_roll_rush_zones (
        rush_id TEXT PRIMARY KEY,
        source_world_boss_id TEXT NOT NULL,
        parent_channel_id TEXT NOT NULL,
        rush_channel_id TEXT NOT NULL,
        kickoff_message_id TEXT NOT NULL,
        activated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        closed_at TEXT,
        close_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  if (!hasColumn(db, "dice_world_boss_double_roll_rush_zones", "close_reason")) {
    db.exec(`
      ALTER TABLE dice_world_boss_double_roll_rush_zones
      ADD COLUMN close_reason TEXT;
    `);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dice_world_boss_double_roll_rush_source_world_boss_id
      ON dice_world_boss_double_roll_rush_zones (source_world_boss_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dice_world_boss_double_roll_rush_channel_id
      ON dice_world_boss_double_roll_rush_zones (rush_channel_id);

    CREATE INDEX IF NOT EXISTS idx_dice_world_boss_double_roll_rush_open_expires_at
      ON dice_world_boss_double_roll_rush_zones (closed_at, expires_at, activated_at);
  `);
};

const resetLegacyContractsStateForContractMaster = (
  db: SqliteDatabase,
  previousSchemaVersion: number,
): void => {
  if (previousSchemaVersion >= currentSchemaVersion) {
    return;
  }

  if (!hasTable(db, "dice_contract_rotations") || !hasTable(db, "dice_contract_progress")) {
    return;
  }

  db.exec(`
    DELETE FROM dice_contract_rotations;
    DELETE FROM dice_contract_progress;
  `);
};

const buildSchemaError = (message: string, details: string[]): Error => {
  const lines = [message, ...details.map((detail) => `- ${detail}`)];
  return new Error(lines.join("\n"));
};

const hasExistingUserTables = (db: SqliteDatabase): boolean => {
  const row = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    )
    .get() as { 1: number } | undefined;
  return Boolean(row);
};

const hasTable = (db: SqliteDatabase, tableName: string): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return Boolean(row);
};

const hasColumn = (db: SqliteDatabase, tableName: string, columnName: string): boolean => {
  if (!hasTable(db, tableName)) {
    return false;
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
};
