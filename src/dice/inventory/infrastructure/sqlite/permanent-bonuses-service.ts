import type { SqliteDatabase } from "../../../../shared/db";
import type { DicePermanentBonusesPort } from "../../application/ports";
import { getPermanentBonuses } from "../../domain/passive-items";
import { createSqliteInventoryRepository } from "./inventory-repository";

export const createSqlitePermanentBonusesPort = (db: SqliteDatabase): DicePermanentBonusesPort => {
  const inventory = createSqliteInventoryRepository(db);

  return {
    getPermanentBonuses: (userId) => getPermanentBonuses(inventory.getInventoryQuantities(userId)),
  };
};
