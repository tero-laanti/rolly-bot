import type { SqliteDatabase } from "../../db";
import type { UnitOfWork } from "../../../shared-kernel/application/unit-of-work";

export const createSqliteUnitOfWork = (db: SqliteDatabase): UnitOfWork => {
  return {
    runInTransaction: <T>(work: () => T): T => db.transaction(work)(),
  };
};
