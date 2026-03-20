import type { SqliteDatabase } from "../db";

type TableInfoRow = {
  name: string;
};

const ensureBalancesLastDailyPipRewardColumn = (db: SqliteDatabase): void => {
  const columns = db.prepare("PRAGMA table_info(balances)").all() as TableInfoRow[];
  const hasLastDailyPipRewardAt = columns.some(
    (column) => column.name === "last_daily_pip_reward_at",
  );

  if (hasLastDailyPipRewardAt) {
    return;
  }

  db.exec("ALTER TABLE balances ADD COLUMN last_daily_pip_reward_at TEXT");
};

export const initializeDatabaseSchema = (db: SqliteDatabase): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS balances (
      user_id TEXT PRIMARY KEY,
      fame INTEGER NOT NULL DEFAULT 0,
      pips INTEGER NOT NULL DEFAULT 0,
      last_daily_pip_reward_at TEXT,
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

    CREATE TABLE IF NOT EXISTS dice_levels_by_prestige (
      user_id TEXT NOT NULL,
      prestige INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
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
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dice_analytics (
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

    CREATE TABLE IF NOT EXISTS dice_charge_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_roll_at TEXT NOT NULL,
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
      near_levelup_rolls_total INTEGER NOT NULL DEFAULT 0,
      highest_charge_multiplier INTEGER NOT NULL DEFAULT 1,
      highest_roll_pass_count INTEGER NOT NULL DEFAULT 1,
      level_ups_total INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS dice_raid_achievement_stats (
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
  `);

  ensureBalancesLastDailyPipRewardColumn(db);
};
