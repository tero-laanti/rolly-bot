import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceEconomyRepository } from "../../application/ports";
import type { EconomyChange, EconomySnapshot } from "../../domain/balance";

const getEconomySnapshot = (db: SqliteDatabase, userId: string): EconomySnapshot => {
  const row = db.prepare("SELECT fame, pips FROM balances WHERE user_id = ?").get(userId) as
    | EconomySnapshot
    | undefined;

  return {
    fame: row?.fame ?? 0,
    pips: row?.pips ?? 0,
  };
};

const getFame = (db: SqliteDatabase, userId: string): number => {
  return getEconomySnapshot(db, userId).fame;
};

const getPips = (db: SqliteDatabase, userId: string): number => {
  return getEconomySnapshot(db, userId).pips;
};

const applyFameDelta = (db: SqliteDatabase, { userId, amount }: EconomyChange): number => {
  const updatedAt = new Date().toISOString();
  const upsert = db.prepare(
    `
    INSERT INTO balances (user_id, fame, updated_at)
    VALUES (@userId, @amount, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET fame = fame + excluded.fame, updated_at = excluded.updated_at
  `,
  );
  const select = db.prepare("SELECT fame FROM balances WHERE user_id = ?");

  return db.transaction(() => {
    upsert.run({ userId, amount, updatedAt });
    const row = select.get(userId) as { fame: number } | undefined;
    return row?.fame ?? 0;
  })();
};

const applyPipsDelta = (db: SqliteDatabase, { userId, amount }: EconomyChange): number => {
  const updatedAt = new Date().toISOString();
  const upsert = db.prepare(
    `
    INSERT INTO balances (user_id, pips, updated_at)
    VALUES (@userId, @amount, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET pips = pips + excluded.pips, updated_at = excluded.updated_at
  `,
  );
  const select = db.prepare("SELECT pips FROM balances WHERE user_id = ?");

  return db.transaction(() => {
    upsert.run({ userId, amount, updatedAt });
    const row = select.get(userId) as { pips: number } | undefined;
    return row?.pips ?? 0;
  })();
};

export const createSqliteEconomyRepository = (db: SqliteDatabase): DiceEconomyRepository => {
  return {
    getEconomySnapshot: (userId) => getEconomySnapshot(db, userId),
    getFame: (userId) => getFame(db, userId),
    getPips: (userId) => getPips(db, userId),
    applyFameDelta: (change) => applyFameDelta(db, change),
    applyPipsDelta: (change) => applyPipsDelta(db, change),
  };
};
