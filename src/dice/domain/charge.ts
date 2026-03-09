import type { SqliteDatabase } from "../../shared/db";
import { getDiceChargeMaxMultiplier, getDiceChargeStartMs } from "./balance";

const minuteMs = 60_000;

export const getLastDiceRollAt = (db: SqliteDatabase): number | null => {
  const row = db.prepare("SELECT last_roll_at FROM dice_charge_state WHERE id = 1").get() as
    | { last_roll_at: string }
    | undefined;

  if (!row) {
    return null;
  }

  const parsed = Date.parse(row.last_roll_at);
  return Number.isNaN(parsed) ? null : parsed;
};

export const setLastDiceRollAt = (db: SqliteDatabase, nowMs: number): void => {
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

export const getDiceChargeMultiplier = (
  lastRollAtMs: number | null,
  nowMs: number = Date.now(),
): number => {
  if (lastRollAtMs === null) {
    return 1;
  }

  const elapsedMs = Math.max(0, nowMs - lastRollAtMs);
  const diceChargeStartMs = getDiceChargeStartMs();
  if (elapsedMs < diceChargeStartMs + minuteMs) {
    return 1;
  }

  const elapsedChargeMinutes = Math.floor((elapsedMs - diceChargeStartMs) / minuteMs);
  return Math.min(getDiceChargeMaxMultiplier(), Math.max(1, elapsedChargeMinutes));
};
