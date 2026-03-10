import type { SqliteDatabase } from "./db";
import { createSqliteEconomyRepository } from "../dice/economy/infrastructure/sqlite/balance-repository";

export type { EconomyChange, EconomySnapshot } from "../dice/economy/domain/balance";

export const getEconomySnapshot = (db: SqliteDatabase, userId: string) => {
  return createSqliteEconomyRepository(db).getEconomySnapshot(userId);
};

export const getFame = (db: SqliteDatabase, userId: string) => {
  return createSqliteEconomyRepository(db).getFame(userId);
};

export const getPips = (db: SqliteDatabase, userId: string) => {
  return createSqliteEconomyRepository(db).getPips(userId);
};

export const applyFameDelta = (
  db: SqliteDatabase,
  change: import("../dice/economy/domain/balance").EconomyChange,
) => {
  return createSqliteEconomyRepository(db).applyFameDelta(change);
};

export const applyPipsDelta = (
  db: SqliteDatabase,
  change: import("../dice/economy/domain/balance").EconomyChange,
) => {
  return createSqliteEconomyRepository(db).applyPipsDelta(change);
};
