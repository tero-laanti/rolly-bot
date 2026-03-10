import type { SqliteDatabase } from "../../../../shared/db";
import { createDiceItemEffectsService } from "../../application/item-effects-service";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";

export const createSqliteDiceItemEffectsService = (db: SqliteDatabase) => {
  return createDiceItemEffectsService(createSqliteProgressionRepository(db));
};
