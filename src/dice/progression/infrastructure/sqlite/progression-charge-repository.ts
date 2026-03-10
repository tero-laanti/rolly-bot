import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceProgressionRepository } from "../../application/ports";

export const createSqliteProgressionChargeRepository = (
  db: SqliteDatabase,
): Pick<DiceProgressionRepository, "getLastDiceRollAt" | "setLastDiceRollAt"> => {
  const getLastDiceRollAt = (): number | null => {
    const row = db.prepare("SELECT last_roll_at FROM dice_charge_state WHERE id = 1").get() as
      | { last_roll_at: string }
      | undefined;

    if (!row) {
      return null;
    }

    const parsed = Date.parse(row.last_roll_at);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const setLastDiceRollAt = (nowMs: number): void => {
    const lastRollAt = new Date(nowMs).toISOString();
    const updatedAt = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO dice_charge_state (id, last_roll_at, updated_at)
      VALUES (1, @lastRollAt, @updatedAt)
      ON CONFLICT(id)
      DO UPDATE SET last_roll_at = excluded.last_roll_at, updated_at = excluded.updated_at
    `,
    ).run({ lastRollAt, updatedAt });
  };

  return {
    getLastDiceRollAt,
    setLastDiceRollAt,
  };
};
