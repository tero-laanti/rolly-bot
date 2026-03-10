import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteAnalyticsRepository } from "../../../analytics/infrastructure/sqlite/analytics-repository";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";
import { createDicePvpUseCase } from "../../application/manage-challenge/use-case";
import { createSqliteDiceHostileEffectsService } from "../../../progression/infrastructure/sqlite/hostile-effects-service";
import { createSqlitePvpRepository } from "./pvp-repository";

export const createSqliteDicePvpUseCase = (db: SqliteDatabase) => {
  const unitOfWork = createSqliteUnitOfWork(db);
  const analytics = createSqliteAnalyticsRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const pvp = createSqlitePvpRepository(db);
  const hostileEffects = createSqliteDiceHostileEffectsService(db);

  return createDicePvpUseCase({
    analytics,
    hostileEffects,
    progression,
    pvp,
    unitOfWork,
  });
};
