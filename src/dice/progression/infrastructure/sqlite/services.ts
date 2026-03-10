import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteAnalyticsRepository } from "../../../analytics/infrastructure/sqlite/analytics-repository";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createDiceItemEffectsService } from "../../../inventory/application/item-effects-service";
import { createSqlitePvpRepository } from "../../../pvp/infrastructure/sqlite/pvp-repository";
import { createDiceBansUseCase } from "../../application/manage-bans/use-case";
import { createDicePrestigeUseCase } from "../../application/manage-prestige/use-case";
import { createQueryDiceAchievementsUseCase } from "../../application/query-achievements/use-case";
import { createRunRollDiceUseCase } from "../../application/roll-dice/use-case";
import { createSqliteProgressionRepository } from "./progression-repository";

export const createSqliteDicePrestigeUseCase = (db: SqliteDatabase) => {
  const unitOfWork = createSqliteUnitOfWork(db);
  const analytics = createSqliteAnalyticsRepository(db);
  const progression = createSqliteProgressionRepository(db);

  return createDicePrestigeUseCase({
    analytics,
    progression,
    unitOfWork,
  });
};

export const createSqliteDiceBansUseCase = (db: SqliteDatabase) => {
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);

  return createDiceBansUseCase({
    economy,
    progression,
  });
};

export const createSqliteQueryDiceAchievementsUseCase = (db: SqliteDatabase) => {
  const progression = createSqliteProgressionRepository(db);
  return createQueryDiceAchievementsUseCase({
    progression,
  });
};

export const createSqliteRollDiceUseCase = (db: SqliteDatabase) => {
  const unitOfWork = createSqliteUnitOfWork(db);
  const analytics = createSqliteAnalyticsRepository(db);
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const pvp = createSqlitePvpRepository(db);
  const itemEffects = createDiceItemEffectsService(progression);

  return createRunRollDiceUseCase({
    analytics,
    economy,
    itemEffects,
    progression,
    pvp,
    unitOfWork,
  });
};
