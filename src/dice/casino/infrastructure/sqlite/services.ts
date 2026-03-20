import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";
import { createDiceCasinoUseCase } from "../../application/manage-casino/use-case";
import {
  createSqliteDiceCasinoAnalyticsRepository,
  createSqliteDiceCasinoSessionRepository,
} from "./casino-repository";

export const createSqliteDiceCasinoUseCase = (db: SqliteDatabase) => {
  const analytics = createSqliteDiceCasinoAnalyticsRepository(db);
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const sessions = createSqliteDiceCasinoSessionRepository(db);
  const unitOfWork = createSqliteUnitOfWork(db);

  return createDiceCasinoUseCase({
    analytics,
    economy,
    progression,
    sessions,
    unitOfWork,
  });
};
