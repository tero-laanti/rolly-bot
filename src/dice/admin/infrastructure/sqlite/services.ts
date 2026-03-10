import type { SqliteDatabase } from "../../../../shared/db";
import { createDiceAdminUseCase } from "../../application/manage-admin/use-case";
import { createSqlitePvpRepository } from "../../../pvp/infrastructure/sqlite/pvp-repository";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";

export const createSqliteDiceAdminUseCase = (db: SqliteDatabase) => {
  return createDiceAdminUseCase({
    progression: createSqliteProgressionRepository(db),
    pvp: createSqlitePvpRepository(db),
  });
};
