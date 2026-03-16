import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceBanUpdate, DiceProgressionRepository } from "../../application/ports";

export const createSqliteProgressionBansRepository = (
  db: SqliteDatabase,
): Pick<
  DiceProgressionRepository,
  "getDiceBans" | "setDiceBan" | "clearSingleDiceBan" | "clearDiceBan" | "clearUserDiceBans"
> => {
  const getDiceBans = (userId: string): Map<number, Set<number>> => {
    const rows = db
      .prepare("SELECT die_index, banned_value FROM dice_bans WHERE user_id = ? ORDER BY die_index")
      .all(userId) as { die_index: number; banned_value: number }[];

    const bans = new Map<number, Set<number>>();
    for (const row of rows) {
      const current = bans.get(row.die_index);
      if (current) {
        current.add(row.banned_value);
        continue;
      }

      bans.set(row.die_index, new Set([row.banned_value]));
    }

    return bans;
  };

  const setDiceBan = ({ userId, dieIndex, bannedValue }: DiceBanUpdate): void => {
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

  const clearSingleDiceBan = (userId: string, dieIndex: number, bannedValue: number): void => {
    db.prepare(
      "DELETE FROM dice_bans WHERE user_id = ? AND die_index = ? AND banned_value = ?",
    ).run(userId, dieIndex, bannedValue);
  };

  const clearDiceBan = (userId: string, dieIndex: number): void => {
    db.prepare("DELETE FROM dice_bans WHERE user_id = ? AND die_index = ?").run(userId, dieIndex);
  };

  const clearUserDiceBans = (userId: string): void => {
    db.prepare("DELETE FROM dice_bans WHERE user_id = ?").run(userId);
  };

  return {
    getDiceBans,
    setDiceBan,
    clearSingleDiceBan,
    clearDiceBan,
    clearUserDiceBans,
  };
};
