import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqlitePvpRepository } from "../../../pvp/infrastructure/sqlite/pvp-repository";
import { createDiceHostileEffectsService } from "../../application/hostile-effects-service";
import { createSqliteProgressionRepository } from "./progression-repository";

export const createSqliteDiceHostileEffectsService = (db: SqliteDatabase) => {
  return createDiceHostileEffectsService({
    progression: createSqliteProgressionRepository(db),
    pvp: createSqlitePvpRepository(db),
    unitOfWork: createSqliteUnitOfWork(db),
  });
};
