import type { SqliteDatabase } from "../../shared/db";
import { getFame } from "../../shared/economy";
import {
  getMaxBansPerDie,
  getUnlockedBanSlotsFromFame,
} from "./balance";
import { getDiceLevel, getDiceSides } from "./prestige";

type DiceBanUpdate = {
  userId: string;
  dieIndex: number;
  bannedValue: number;
};

export const getUnlockedBanSlots = (db: SqliteDatabase, userId: string): number => {
  const fame = getFame(db, userId);
  const level = getDiceLevel(db, userId);
  const dieSides = getDiceSides(db, userId);
  return getUnlockedBanSlotsFromFame(fame, level, dieSides);
};

export const getDiceBans = (db: SqliteDatabase, userId: string): Map<number, Set<number>> => {
  const rows = db
    .prepare("SELECT die_index, banned_value FROM dice_bans WHERE user_id = ? ORDER BY die_index")
    .all(userId) as { die_index: number; banned_value: number }[];

  const bans = new Map<number, Set<number>>();
  for (const row of rows) {
    const current = bans.get(row.die_index);
    if (current) {
      current.add(row.banned_value);
    } else {
      bans.set(row.die_index, new Set([row.banned_value]));
    }
  }

  return bans;
};

export const setDiceBan = (
  db: SqliteDatabase,
  { userId, dieIndex, bannedValue }: DiceBanUpdate,
): void => {
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_bans (user_id, die_index, banned_value, updated_at)
    VALUES (@userId, @dieIndex, @bannedValue, @updatedAt)
    ON CONFLICT(user_id, die_index, banned_value)
    DO UPDATE SET updated_at = excluded.updated_at
  `,
  ).run({ userId, dieIndex, bannedValue, updatedAt });
};

export const clearSingleDiceBan = (
  db: SqliteDatabase,
  userId: string,
  dieIndex: number,
  bannedValue: number,
): void => {
  db.prepare("DELETE FROM dice_bans WHERE user_id = ? AND die_index = ? AND banned_value = ?").run(
    userId,
    dieIndex,
    bannedValue,
  );
};

export const clearDiceBan = (db: SqliteDatabase, userId: string, dieIndex: number): void => {
  db.prepare("DELETE FROM dice_bans WHERE user_id = ? AND die_index = ?").run(userId, dieIndex);
};

export const clearUserDiceBans = (db: SqliteDatabase, userId: string): void => {
  db.prepare("DELETE FROM dice_bans WHERE user_id = ?").run(userId);
};

export const rollDieWithBans = (bannedValues: Set<number> | null, dieSides: number): number => {
  const options: number[] = [];
  for (let value = 1; value <= dieSides; value += 1) {
    if (!bannedValues || !bannedValues.has(value)) {
      options.push(value);
    }
  }

  if (options.length === 0) {
    return Math.floor(Math.random() * dieSides) + 1;
  }

  const index = Math.floor(Math.random() * options.length);
  return options[index] ?? 1;
};

export { getMaxBansPerDie, getUnlockedBanSlotsFromFame };
