import type { SqliteDatabase } from "../../../../shared/db";
import type {
  DiceGardenAchievementStats,
  DiceGardenPlot,
  DiceGardenRepository,
} from "../../application/ports";

type DiceGardenPlotRow = {
  user_id: string;
  slot_index: number;
  seed_item_id: string;
  die_sides: 4 | 6 | 8 | 10 | 12;
  planted_at: string;
  ready_at: string;
  updated_at: string;
};

type DiceGardenAchievementStatsRow = {
  user_id: string;
  planted_seed_count: number;
  harvested_seed_count: number;
  harvested_d12_count: number;
  updated_at: string;
};

const mapGardenPlot = (row: DiceGardenPlotRow): DiceGardenPlot => ({
  userId: row.user_id,
  slotIndex: row.slot_index,
  seedItemId: row.seed_item_id,
  dieSides: row.die_sides,
  plantedAt: row.planted_at,
  readyAt: row.ready_at,
  updatedAt: row.updated_at,
});

const getActiveGardenPlots = (db: SqliteDatabase, userId: string): DiceGardenPlot[] => {
  const rows = db
    .prepare(
      `
      SELECT user_id, slot_index, seed_item_id, die_sides, planted_at, ready_at, updated_at
      FROM dice_garden_plots
      WHERE user_id = ?
      ORDER BY slot_index ASC
    `,
    )
    .all(userId) as DiceGardenPlotRow[];

  return rows.map(mapGardenPlot);
};

const createGardenPlot = (
  db: SqliteDatabase,
  input: {
    userId: string;
    slotIndex: number;
    seedItemId: string;
    dieSides: 4 | 6 | 8 | 10 | 12;
    plantedAt: string;
    readyAt: string;
  },
): DiceGardenPlot => {
  db.prepare(
    `
    INSERT INTO dice_garden_plots (
      user_id,
      slot_index,
      seed_item_id,
      die_sides,
      planted_at,
      ready_at,
      updated_at
    )
    VALUES (@userId, @slotIndex, @seedItemId, @dieSides, @plantedAt, @readyAt, @updatedAt)
    ON CONFLICT(user_id, slot_index)
    DO UPDATE SET
      seed_item_id = excluded.seed_item_id,
      die_sides = excluded.die_sides,
      planted_at = excluded.planted_at,
      ready_at = excluded.ready_at,
      updated_at = excluded.updated_at
  `,
  ).run({
    ...input,
    updatedAt: input.plantedAt,
  });

  const row = db
    .prepare(
      `
      SELECT user_id, slot_index, seed_item_id, die_sides, planted_at, ready_at, updated_at
      FROM dice_garden_plots
      WHERE user_id = ? AND slot_index = ?
    `,
    )
    .get(input.userId, input.slotIndex) as DiceGardenPlotRow | undefined;

  if (!row) {
    throw new Error(`Failed to create garden plot ${input.userId}:${input.slotIndex}`);
  }

  return mapGardenPlot(row);
};

const clearGardenPlot = (
  db: SqliteDatabase,
  input: { userId: string; slotIndex: number },
): void => {
  db.prepare("DELETE FROM dice_garden_plots WHERE user_id = ? AND slot_index = ?").run(
    input.userId,
    input.slotIndex,
  );
};

const getGardenAchievementStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceGardenAchievementStatsRow | undefined => {
  return db
    .prepare(
      `
      SELECT user_id, planted_seed_count, harvested_seed_count, harvested_d12_count, updated_at
      FROM dice_garden_achievement_stats
      WHERE user_id = ?
    `,
    )
    .get(userId) as DiceGardenAchievementStatsRow | undefined;
};

const getOrCreateGardenAchievementStatsRow = (
  db: SqliteDatabase,
  userId: string,
): DiceGardenAchievementStatsRow => {
  const existing = getGardenAchievementStatsRow(db, userId);
  if (existing) {
    return existing;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dice_garden_achievement_stats (
      user_id,
      planted_seed_count,
      harvested_seed_count,
      harvested_d12_count,
      updated_at
    )
    VALUES (@userId, 0, 0, 0, @updatedAt)
    ON CONFLICT(user_id)
    DO NOTHING
  `,
  ).run({ userId, updatedAt });

  const created = getGardenAchievementStatsRow(db, userId);
  if (!created) {
    throw new Error(`Failed to initialize garden achievement stats for user ${userId}`);
  }

  return created;
};

const mapGardenAchievementStats = (
  row: DiceGardenAchievementStatsRow,
): DiceGardenAchievementStats => ({
  plantedSeedCount: row.planted_seed_count,
  harvestedSeedCount: row.harvested_seed_count,
  harvestedD12Count: row.harvested_d12_count,
});

const getGardenAchievementStats = (
  db: SqliteDatabase,
  userId: string,
): DiceGardenAchievementStats => {
  return mapGardenAchievementStats(getOrCreateGardenAchievementStatsRow(db, userId));
};

const recordGardenPlant = (db: SqliteDatabase, userId: string): DiceGardenAchievementStats => {
  const stats = getOrCreateGardenAchievementStatsRow(db, userId);
  const updatedAt = new Date().toISOString();
  db.prepare(
    `
    UPDATE dice_garden_achievement_stats
    SET planted_seed_count = @plantedSeedCount, updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId,
    plantedSeedCount: stats.planted_seed_count + 1,
    updatedAt,
  });

  return {
    plantedSeedCount: stats.planted_seed_count + 1,
    harvestedSeedCount: stats.harvested_seed_count,
    harvestedD12Count: stats.harvested_d12_count,
  };
};

const recordGardenHarvest = (
  db: SqliteDatabase,
  input: { userId: string; dieSides: 4 | 6 | 8 | 10 | 12 },
): DiceGardenAchievementStats => {
  const stats = getOrCreateGardenAchievementStatsRow(db, input.userId);
  const updatedAt = new Date().toISOString();
  const harvestedD12Count = stats.harvested_d12_count + (input.dieSides === 12 ? 1 : 0);

  db.prepare(
    `
    UPDATE dice_garden_achievement_stats
    SET
      harvested_seed_count = @harvestedSeedCount,
      harvested_d12_count = @harvestedD12Count,
      updated_at = @updatedAt
    WHERE user_id = @userId
  `,
  ).run({
    userId: input.userId,
    harvestedSeedCount: stats.harvested_seed_count + 1,
    harvestedD12Count,
    updatedAt,
  });

  return {
    plantedSeedCount: stats.planted_seed_count,
    harvestedSeedCount: stats.harvested_seed_count + 1,
    harvestedD12Count,
  };
};

export const createSqliteGardenRepository = (db: SqliteDatabase): DiceGardenRepository => {
  return {
    getActiveGardenPlots: (userId) => getActiveGardenPlots(db, userId),
    createGardenPlot: (input) => createGardenPlot(db, input),
    clearGardenPlot: (input) => clearGardenPlot(db, input),
    getGardenAchievementStats: (userId) => getGardenAchievementStats(db, userId),
    recordGardenPlant: (userId) => recordGardenPlant(db, userId),
    recordGardenHarvest: (input) => recordGardenHarvest(db, input),
  };
};
