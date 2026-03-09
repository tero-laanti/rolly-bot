import type { SqliteDatabase } from "../../../shared/db";
import {
  getDicePrestigeBaseLevel,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "./balance";

type DiceLevelUpdate = {
  userId: string;
  level: number;
};

type DiceLevelByPrestigeUpdate = {
  userId: string;
  prestige: number;
  level: number;
};

type DicePrestigeUpdate = {
  userId: string;
  prestige: number;
};

type DiceActivePrestigeUpdate = {
  userId: string;
  prestige: number;
};

export const getDiceLevel = (db: SqliteDatabase, userId: string): number => {
  const activePrestige = getActiveDicePrestige(db, userId);
  return getDiceLevelForPrestige(db, userId, activePrestige);
};

export const getDiceLevelForPrestige = (
  db: SqliteDatabase,
  userId: string,
  prestige: number,
): number => {
  const normalizedPrestige = normalizePrestige(prestige);
  const highestPrestige = getDicePrestige(db, userId);
  const row = db
    .prepare("SELECT level FROM dice_levels_by_prestige WHERE user_id = ? AND prestige = ?")
    .get(userId, normalizedPrestige) as { level: number } | undefined;
  if (row) {
    const normalizedLevel = normalizeLevel(row.level);
    if (normalizedPrestige < highestPrestige && normalizedLevel < getDicePrestigeBaseLevel()) {
      setDiceLevelForPrestige(db, {
        userId,
        prestige: normalizedPrestige,
        level: getDicePrestigeBaseLevel(),
      });
      return getDicePrestigeBaseLevel();
    }

    return normalizedLevel;
  }

  const initialLevel = normalizedPrestige === highestPrestige ? 1 : getDicePrestigeBaseLevel();

  setDiceLevelForPrestige(db, {
    userId,
    prestige: normalizedPrestige,
    level: initialLevel,
  });
  return initialLevel;
};

export const setDiceLevel = (db: SqliteDatabase, { userId, level }: DiceLevelUpdate): void => {
  const activePrestige = getActiveDicePrestige(db, userId);
  setDiceLevelForPrestige(db, { userId, prestige: activePrestige, level });
};

export const setDiceLevelForPrestige = (
  db: SqliteDatabase,
  { userId, prestige, level }: DiceLevelByPrestigeUpdate,
): void => {
  const normalizedPrestige = normalizePrestige(prestige);
  const normalizedLevel = normalizeLevel(level);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_levels_by_prestige (user_id, prestige, level, updated_at)
    VALUES (@userId, @prestige, @level, @updatedAt)
    ON CONFLICT(user_id, prestige)
    DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at
  `,
  ).run({ userId, prestige: normalizedPrestige, level: normalizedLevel, updatedAt });
};

export const getDicePrestige = (db: SqliteDatabase, userId: string): number => {
  const row = db.prepare("SELECT prestige FROM dice_prestige WHERE user_id = ?").get(userId) as
    | { prestige: number }
    | undefined;

  return normalizePrestige(row?.prestige ?? 0);
};

export const setDicePrestige = (
  db: SqliteDatabase,
  { userId, prestige }: DicePrestigeUpdate,
): void => {
  const normalizedPrestige = normalizePrestige(prestige);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_prestige (user_id, prestige, updated_at)
    VALUES (@userId, @prestige, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
  `,
  ).run({ userId, prestige: normalizedPrestige, updatedAt });
};

export const getActiveDicePrestige = (db: SqliteDatabase, userId: string): number => {
  const highestPrestige = getDicePrestige(db, userId);
  const row = db
    .prepare("SELECT prestige FROM dice_active_prestige WHERE user_id = ?")
    .get(userId) as { prestige: number } | undefined;

  if (!row) {
    return highestPrestige;
  }

  const normalizedActive = normalizeActivePrestige(row.prestige, highestPrestige);
  if (normalizedActive !== row.prestige) {
    setActiveDicePrestige(db, { userId, prestige: normalizedActive });
  }

  return normalizedActive;
};

export const setActiveDicePrestige = (
  db: SqliteDatabase,
  { userId, prestige }: DiceActivePrestigeUpdate,
): void => {
  const highestPrestige = getDicePrestige(db, userId);
  const normalizedActive = normalizeActivePrestige(prestige, highestPrestige);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_active_prestige (user_id, prestige, updated_at)
    VALUES (@userId, @prestige, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
  `,
  ).run({ userId, prestige: normalizedActive, updatedAt });
};

export const isOnHighestDicePrestige = (db: SqliteDatabase, userId: string): boolean => {
  return getActiveDicePrestige(db, userId) === getDicePrestige(db, userId);
};

export const getDiceSides = (db: SqliteDatabase, userId: string): number => {
  return getDiceSidesForPrestige(getActiveDicePrestige(db, userId));
};

const normalizePrestige = (prestige: number): number => {
  return Math.min(getMaxDicePrestige(), Math.max(0, Math.floor(prestige)));
};

const normalizeActivePrestige = (prestige: number, highestPrestige: number): number => {
  return Math.min(normalizePrestige(highestPrestige), normalizePrestige(prestige));
};

const normalizeLevel = (level: number): number => {
  return Math.max(1, Math.floor(level));
};
