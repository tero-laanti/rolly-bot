import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createDiceCasinoUseCase } from "../../application/manage-casino/use-case";
import {
  createSqliteDiceCasinoAnalyticsRepository,
  createSqliteDiceCasinoSessionRepository,
} from "./casino-repository";

export const createSqliteDiceCasinoUseCase = (db: SqliteDatabase) => {
  const analytics = createSqliteDiceCasinoAnalyticsRepository(db);
  const economy = createSqliteEconomyRepository(db);
  const sessions = createSqliteDiceCasinoSessionRepository(db);
  const unitOfWork = createSqliteUnitOfWork(db);

  return createDiceCasinoUseCase({
    analytics,
    economy,
    sessions,
    unitOfWork,
  });
};
