import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteContractsGameplayProgressPort } from "../../../contracts/infrastructure/sqlite/services";
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
  const contracts = createSqliteContractsGameplayProgressPort(db);

  return createDiceCasinoUseCase({
    analytics,
    contracts,
    economy,
    progression,
    sessions,
    unitOfWork,
  });
};
