import type { SqliteDatabase } from "../db";

const currentSchemaVersion = 2;

const levelAchievementIdRewrites = new Map<string, string>([
  ["first-level-up", "first-extra-die"],
  ["near-level-up-1", "near-extra-die-1"],
  ["near-level-up-10", "near-extra-die-10"],
  ["near-level-up-25", "near-extra-die-25"],
  ["near-level-up-100", "near-extra-die-100"],
]);

export const initializeDatabaseSchema = (db: SqliteDatabase): void => {
  assertNoLegacySchemaArtifacts(db);

  if (hasExistingUserTables(db)) {
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

    CREATE TABLE IF NOT EXISTS managed_intro_posts (
      slot_index INTEGER PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  assertCurrentSchemaArtifacts(db);
  db.pragma(`user_version = ${currentSchemaVersion}`);
};

export const migrateLegacyDatabaseSchema = (db: SqliteDatabase): boolean => {
  const blockingIssues = getMigrationBlockingIssues(db);
  if (blockingIssues.length > 0) {
    throw buildSchemaError(
      "Cannot run the offline dice-count migration on a partially migrated database.",
      blockingIssues,
    );
  }

  const legacyArtifacts = getLegacySchemaArtifacts(db);
  const currentSchemaIssues = getCurrentSchemaIssues(db);
  const hasPendingAnalyticsPrestigeBackfill = hasPendingDiceAnalyticsPrestigeBackfill(db);
  if (
    legacyArtifacts.length < 1 &&
    currentSchemaIssues.length < 1 &&
    !hasPendingAnalyticsPrestigeBackfill
  ) {
    assertCurrentSchemaArtifacts(db);
    db.pragma(`user_version = ${currentSchemaVersion}`);
    return false;
  }

  db.transaction(() => {
    migrateLegacyProgressionStateTable(db);
    migrateLegacyAnalyticsColumns(db);
    migrateLegacyProgressionAchievementStatsColumns(db);
    rewriteLegacyAchievementIds(db);
    migrateCurrentAnalyticsSchema(db);
    backfillDiceAnalyticsByPrestige(db);

    const remainingLegacyArtifacts = getLegacySchemaArtifacts(db);
    if (remainingLegacyArtifacts.length > 0) {
      throw buildSchemaError(
        "Offline dice-count migration did not fully clear legacy schema artifacts.",
        remainingLegacyArtifacts,
      );
    }

    if (hasPendingDiceAnalyticsPrestigeBackfill(db)) {
      throw buildSchemaError("Offline dice analytics backfill did not fully seed prestige rows.", [
        "Some dice_analytics rows are still missing matching dice_analytics_by_prestige rows.",
      ]);
    }

    assertCurrentSchemaArtifacts(db);
    db.pragma(`user_version = ${currentSchemaVersion}`);
  })();

  return true;
};

const migrateLegacyProgressionStateTable = (db: SqliteDatabase): void => {
  const hasLegacyTable = hasTable(db, "dice_levels_by_prestige");
  const hasCurrentTable = hasTable(db, "dice_counts_by_prestige");

  if (hasLegacyTable && hasCurrentTable) {
    throw new Error(
      "Both dice_levels_by_prestige and dice_counts_by_prestige exist. Resolve the duplicate progression tables before continuing.",
    );
  }

  if (hasLegacyTable) {
    db.exec("ALTER TABLE dice_levels_by_prestige RENAME TO dice_counts_by_prestige");
  }

  renameColumnIfExists(db, "dice_counts_by_prestige", "level", "dice_count");
};

const migrateLegacyAnalyticsColumns = (db: SqliteDatabase): void => {
  renameColumnIfExists(db, "dice_analytics", "level_started_at", "dice_count_started_at");
  renameColumnIfExists(db, "dice_analytics", "rolls_current_level", "roll_sets_current_dice_count");
  renameColumnIfExists(
    db,
    "dice_analytics",
    "near_levelup_rolls_current_level",
    "near_dice_count_increase_roll_sets_current_dice_count",
  );
};

const migrateCurrentAnalyticsSchema = (db: SqliteDatabase): void => {
  addColumnIfMissing(db, "dice_analytics", "total_dice_sets_rolled", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(
    db,
    "dice_analytics",
    "total_roll_commands_called",
    "INTEGER NOT NULL DEFAULT 0",
  );

  db.exec(`
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
  `);

  addColumnIfMissing(
    db,
    "dice_analytics_by_prestige",
    "prestige_started_at",
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(
    db,
    "dice_analytics_by_prestige",
    "dice_count_started_at",
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(
    db,
    "dice_analytics_by_prestige",
    "roll_sets_current_dice_count",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "dice_analytics_by_prestige",
    "near_dice_count_increase_roll_sets_current_dice_count",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "dice_analytics_by_prestige",
    "dice_rolled_current_prestige",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(db, "dice_analytics_by_prestige", "updated_at", "TEXT NOT NULL DEFAULT ''");
};

const migrateLegacyProgressionAchievementStatsColumns = (db: SqliteDatabase): void => {
  renameColumnIfExists(
    db,
    "dice_progression_achievement_stats",
    "near_levelup_rolls_total",
    "near_dice_count_increase_rolls_total",
  );
  renameColumnIfExists(
    db,
    "dice_progression_achievement_stats",
    "level_ups_total",
    "dice_count_increases_total",
  );
};

const rewriteLegacyAchievementIds = (db: SqliteDatabase): void => {
  if (!hasTable(db, "user_achievements")) {
    return;
  }

  for (const [legacyId, currentId] of levelAchievementIdRewrites) {
    db.prepare(
      `
      INSERT INTO user_achievements (user_id, achievement_id, earned_at)
      SELECT user_id, @currentId, earned_at
      FROM user_achievements
      WHERE achievement_id = @legacyId
      ON CONFLICT(user_id, achievement_id)
      DO UPDATE SET earned_at = MIN(user_achievements.earned_at, excluded.earned_at)
    `,
    ).run({ legacyId, currentId });

    db.prepare("DELETE FROM user_achievements WHERE achievement_id = ?").run(legacyId);
  }
};

const backfillDiceAnalyticsByPrestige = (db: SqliteDatabase): void => {
  if (!hasTable(db, "dice_analytics") || !hasTable(db, "dice_analytics_by_prestige")) {
    return;
  }

  const rows = db
    .prepare(
      `
      SELECT
        user_id,
        prestige_started_at,
        dice_count_started_at,
        roll_sets_current_dice_count,
        near_dice_count_increase_roll_sets_current_dice_count,
        dice_rolled_current_prestige,
        updated_at
      FROM dice_analytics
    `,
    )
    .all() as Array<{
    user_id: string;
    prestige_started_at: string;
    dice_count_started_at: string;
    roll_sets_current_dice_count: number;
    near_dice_count_increase_roll_sets_current_dice_count: number;
    dice_rolled_current_prestige: number;
    updated_at: string;
  }>;

  const insert = db.prepare(
    `
      INSERT INTO dice_analytics_by_prestige (
        user_id,
        prestige,
        prestige_started_at,
        dice_count_started_at,
        roll_sets_current_dice_count,
        near_dice_count_increase_roll_sets_current_dice_count,
        dice_rolled_current_prestige,
        updated_at
      )
      VALUES (
        @userId,
        @prestige,
        @prestigeStartedAt,
        @diceCountStartedAt,
        @rollSetsCurrentDiceCount,
        @nearDiceCountIncreaseRollSetsCurrentDiceCount,
        @diceRolledCurrentPrestige,
        @updatedAt
      )
      ON CONFLICT(user_id, prestige)
      DO UPDATE SET
        prestige_started_at = excluded.prestige_started_at,
        dice_count_started_at = excluded.dice_count_started_at,
        roll_sets_current_dice_count = excluded.roll_sets_current_dice_count,
        near_dice_count_increase_roll_sets_current_dice_count = excluded.near_dice_count_increase_roll_sets_current_dice_count,
        dice_rolled_current_prestige = excluded.dice_rolled_current_prestige,
        updated_at = excluded.updated_at
    `,
  );

  for (const row of rows) {
    insert.run({
      userId: row.user_id,
      prestige: resolveAnalyticsBackfillPrestige(db, row.user_id),
      prestigeStartedAt: row.prestige_started_at,
      diceCountStartedAt: row.dice_count_started_at,
      rollSetsCurrentDiceCount: row.roll_sets_current_dice_count,
      nearDiceCountIncreaseRollSetsCurrentDiceCount:
        row.near_dice_count_increase_roll_sets_current_dice_count,
      diceRolledCurrentPrestige: row.dice_rolled_current_prestige,
      updatedAt: row.updated_at,
    });
  }
};

const assertNoLegacySchemaArtifacts = (db: SqliteDatabase): void => {
  const legacyArtifacts = getLegacySchemaArtifacts(db);
  if (legacyArtifacts.length < 1) {
    return;
  }

  throw buildSchemaError(
    "Legacy dice progression schema detected. Run the offline dice-count migration before starting the bot.",
    legacyArtifacts,
  );
};

const assertCurrentSchemaArtifacts = (db: SqliteDatabase): void => {
  const issues = getCurrentSchemaIssues(db);
  if (issues.length < 1) {
    return;
  }

  throw buildSchemaError("Current dice-count schema is incomplete or invalid.", issues);
};

const getLegacySchemaArtifacts = (db: SqliteDatabase): string[] => {
  const artifacts: string[] = [];

  if (hasTable(db, "dice_levels_by_prestige")) {
    artifacts.push("Legacy table dice_levels_by_prestige exists.");
  }
  if (hasColumn(db, "dice_counts_by_prestige", "level")) {
    artifacts.push("Legacy column dice_counts_by_prestige.level exists.");
  }
  if (hasColumn(db, "dice_analytics", "level_started_at")) {
    artifacts.push("Legacy column dice_analytics.level_started_at exists.");
  }
  if (hasColumn(db, "dice_analytics", "rolls_current_level")) {
    artifacts.push("Legacy column dice_analytics.rolls_current_level exists.");
  }
  if (hasColumn(db, "dice_analytics", "near_levelup_rolls_current_level")) {
    artifacts.push("Legacy column dice_analytics.near_levelup_rolls_current_level exists.");
  }
  if (hasColumn(db, "dice_progression_achievement_stats", "near_levelup_rolls_total")) {
    artifacts.push(
      "Legacy column dice_progression_achievement_stats.near_levelup_rolls_total exists.",
    );
  }
  if (hasColumn(db, "dice_progression_achievement_stats", "level_ups_total")) {
    artifacts.push("Legacy column dice_progression_achievement_stats.level_ups_total exists.");
  }

  const legacyAchievementCount = getLegacyAchievementIdCount(db);
  if (legacyAchievementCount > 0) {
    const rowLabel = legacyAchievementCount === 1 ? "row" : "rows";
    artifacts.push(
      `Legacy achievement ids remain in user_achievements (${legacyAchievementCount} ${rowLabel}).`,
    );
  }

  return artifacts;
};

const getCurrentSchemaIssues = (db: SqliteDatabase): string[] => {
  const issues: string[] = [];

  if (!hasColumn(db, "dice_counts_by_prestige", "dice_count")) {
    issues.push("Missing current column dice_counts_by_prestige.dice_count.");
  }
  if (!hasColumn(db, "dice_analytics", "dice_count_started_at")) {
    issues.push("Missing current column dice_analytics.dice_count_started_at.");
  }
  if (!hasColumn(db, "dice_analytics", "roll_sets_current_dice_count")) {
    issues.push("Missing current column dice_analytics.roll_sets_current_dice_count.");
  }
  if (!hasColumn(db, "dice_analytics", "near_dice_count_increase_roll_sets_current_dice_count")) {
    issues.push(
      "Missing current column dice_analytics.near_dice_count_increase_roll_sets_current_dice_count.",
    );
  }
  if (!hasColumn(db, "dice_analytics", "total_dice_sets_rolled")) {
    issues.push("Missing current column dice_analytics.total_dice_sets_rolled.");
  }
  if (!hasColumn(db, "dice_analytics", "total_roll_commands_called")) {
    issues.push("Missing current column dice_analytics.total_roll_commands_called.");
  }
  if (!hasTable(db, "dice_analytics_by_prestige")) {
    issues.push("Missing current table dice_analytics_by_prestige.");
  }
  if (!hasColumn(db, "dice_analytics_by_prestige", "prestige_started_at")) {
    issues.push("Missing current column dice_analytics_by_prestige.prestige_started_at.");
  }
  if (!hasColumn(db, "dice_analytics_by_prestige", "dice_count_started_at")) {
    issues.push("Missing current column dice_analytics_by_prestige.dice_count_started_at.");
  }
  if (!hasColumn(db, "dice_analytics_by_prestige", "roll_sets_current_dice_count")) {
    issues.push("Missing current column dice_analytics_by_prestige.roll_sets_current_dice_count.");
  }
  if (
    !hasColumn(
      db,
      "dice_analytics_by_prestige",
      "near_dice_count_increase_roll_sets_current_dice_count",
    )
  ) {
    issues.push(
      "Missing current column dice_analytics_by_prestige.near_dice_count_increase_roll_sets_current_dice_count.",
    );
  }
  if (!hasColumn(db, "dice_analytics_by_prestige", "dice_rolled_current_prestige")) {
    issues.push("Missing current column dice_analytics_by_prestige.dice_rolled_current_prestige.");
  }
  if (!hasColumn(db, "dice_analytics_by_prestige", "updated_at")) {
    issues.push("Missing current column dice_analytics_by_prestige.updated_at.");
  }
  if (
    !hasColumn(db, "dice_progression_achievement_stats", "near_dice_count_increase_rolls_total")
  ) {
    issues.push(
      "Missing current column dice_progression_achievement_stats.near_dice_count_increase_rolls_total.",
    );
  }
  if (!hasColumn(db, "dice_progression_achievement_stats", "dice_count_increases_total")) {
    issues.push(
      "Missing current column dice_progression_achievement_stats.dice_count_increases_total.",
    );
  }

  return issues;
};

const hasPendingDiceAnalyticsPrestigeBackfill = (db: SqliteDatabase): boolean => {
  if (!hasTable(db, "dice_analytics")) {
    return false;
  }

  if (!hasTable(db, "dice_analytics_by_prestige")) {
    const analyticsRowCount = db.prepare("SELECT COUNT(*) AS count FROM dice_analytics").get() as {
      count: number;
    };
    return analyticsRowCount.count > 0;
  }

  const rows = db.prepare("SELECT user_id FROM dice_analytics").all() as Array<{ user_id: string }>;
  const selectPrestigeRow = db.prepare(
    "SELECT 1 FROM dice_analytics_by_prestige WHERE user_id = ? AND prestige = ?",
  );

  return rows.some(({ user_id: userId }) => {
    const prestige = resolveAnalyticsBackfillPrestige(db, userId);
    return !selectPrestigeRow.get(userId, prestige);
  });
};

const resolveAnalyticsBackfillPrestige = (db: SqliteDatabase, userId: string): number => {
  const activePrestige = getOptionalPrestigeValue(
    db,
    "dice_active_prestige",
    "SELECT prestige FROM dice_active_prestige WHERE user_id = ?",
    userId,
  );
  const highestUnlockedPrestige = getOptionalPrestigeValue(
    db,
    "dice_prestige",
    "SELECT prestige FROM dice_prestige WHERE user_id = ?",
    userId,
  );
  const currentTrackedPrestige = getOptionalPrestigeValue(
    db,
    "dice_counts_by_prestige",
    "SELECT MAX(prestige) AS prestige FROM dice_counts_by_prestige WHERE user_id = ?",
    userId,
  );
  const legacyTrackedPrestige = getOptionalPrestigeValue(
    db,
    "dice_levels_by_prestige",
    "SELECT MAX(prestige) AS prestige FROM dice_levels_by_prestige WHERE user_id = ?",
    userId,
  );
  const resolvedHighestPrestige =
    highestUnlockedPrestige ??
    currentTrackedPrestige ??
    legacyTrackedPrestige ??
    activePrestige ??
    0;

  if (activePrestige === null) {
    return resolvedHighestPrestige;
  }

  return Math.max(0, Math.min(activePrestige, resolvedHighestPrestige));
};

const getMigrationBlockingIssues = (db: SqliteDatabase): string[] => {
  const issues: string[] = [];

  if (hasTable(db, "dice_levels_by_prestige") && hasTable(db, "dice_counts_by_prestige")) {
    issues.push("Both dice_levels_by_prestige and dice_counts_by_prestige exist.");
  }
  pushMixedColumnIssue(db, issues, "dice_counts_by_prestige", "level", "dice_count");
  pushMixedColumnIssue(db, issues, "dice_analytics", "level_started_at", "dice_count_started_at");
  pushMixedColumnIssue(
    db,
    issues,
    "dice_analytics",
    "rolls_current_level",
    "roll_sets_current_dice_count",
  );
  pushMixedColumnIssue(
    db,
    issues,
    "dice_analytics",
    "near_levelup_rolls_current_level",
    "near_dice_count_increase_roll_sets_current_dice_count",
  );
  pushMixedColumnIssue(
    db,
    issues,
    "dice_progression_achievement_stats",
    "near_levelup_rolls_total",
    "near_dice_count_increase_rolls_total",
  );
  pushMixedColumnIssue(
    db,
    issues,
    "dice_progression_achievement_stats",
    "level_ups_total",
    "dice_count_increases_total",
  );

  return issues;
};

const pushMixedColumnIssue = (
  db: SqliteDatabase,
  issues: string[],
  tableName: string,
  legacyColumnName: string,
  currentColumnName: string,
): void => {
  if (hasColumn(db, tableName, legacyColumnName) && hasColumn(db, tableName, currentColumnName)) {
    issues.push(
      `Both ${tableName}.${legacyColumnName} and ${tableName}.${currentColumnName} exist.`,
    );
  }
};

const getLegacyAchievementIdCount = (db: SqliteDatabase): number => {
  if (!hasTable(db, "user_achievements")) {
    return 0;
  }

  const legacyAchievementIds = Array.from(levelAchievementIdRewrites.keys());
  const placeholders = legacyAchievementIds.map(() => "?").join(", ");
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM user_achievements WHERE achievement_id IN (${placeholders})`,
    )
    .get(...legacyAchievementIds) as { count: number };

  return row.count;
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

const getOptionalPrestigeValue = (
  db: SqliteDatabase,
  tableName: string,
  query: string,
  userId: string,
): number | null => {
  if (!hasTable(db, tableName)) {
    return null;
  }

  const row = db.prepare(query).get(userId) as { prestige: number | null } | undefined;
  if (!row || row.prestige === null || Number.isNaN(row.prestige)) {
    return null;
  }

  return Math.max(0, Math.floor(row.prestige));
};

const hasColumn = (db: SqliteDatabase, tableName: string, columnName: string): boolean => {
  if (!hasTable(db, tableName)) {
    return false;
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
};

const addColumnIfMissing = (
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void => {
  if (!hasTable(db, tableName) || hasColumn(db, tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
};

const renameColumnIfExists = (
  db: SqliteDatabase,
  tableName: string,
  legacyColumnName: string,
  currentColumnName: string,
): void => {
  const hasLegacyColumn = hasColumn(db, tableName, legacyColumnName);
  const hasCurrentColumn = hasColumn(db, tableName, currentColumnName);

  if (!hasLegacyColumn || hasCurrentColumn) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} RENAME COLUMN ${legacyColumnName} TO ${currentColumnName}`);
};
