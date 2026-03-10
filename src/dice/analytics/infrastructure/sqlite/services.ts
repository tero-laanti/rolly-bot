import type { SqliteDatabase } from "../../../../shared/db";
import { createQueryDiceAnalyticsUseCase } from "../../application/query-dashboard/use-case";
import { createSqliteAnalyticsRepository } from "./analytics-repository";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";

export const createSqliteQueryDiceAnalyticsUseCase = (db: SqliteDatabase) => {
  const analytics = createSqliteAnalyticsRepository(db);
  const progression = createSqliteProgressionRepository(db);

  return createQueryDiceAnalyticsUseCase({
    analytics,
    progression,
  });
};
