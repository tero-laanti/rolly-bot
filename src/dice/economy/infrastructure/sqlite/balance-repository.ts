import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceEconomyRepository } from "../../application/ports";
import {
  applyFameDelta,
  applyPipsDelta,
  getEconomySnapshot,
  getFame,
  getPips,
} from "../../domain/balance";

export const createSqliteEconomyRepository = (db: SqliteDatabase): DiceEconomyRepository => {
  return {
    getEconomySnapshot: (userId) => getEconomySnapshot(db, userId),
    getFame: (userId) => getFame(db, userId),
    getPips: (userId) => getPips(db, userId),
    applyFameDelta: (change) => applyFameDelta(db, change),
    applyPipsDelta: (change) => applyPipsDelta(db, change),
  };
};
