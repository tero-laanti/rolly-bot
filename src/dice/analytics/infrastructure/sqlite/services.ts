import type { SqliteDatabase } from "../../../../shared/db";
import { createQueryDiceStatsUseCase } from "../../application/query-dashboard/use-case";
import { createSqliteAnalyticsRepository } from "./analytics-repository";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createSqliteGardenRepository } from "../../../inventory/infrastructure/sqlite/garden-repository";
import { createSqliteDiceItemEffectsService } from "../../../inventory/infrastructure/sqlite/item-effects-service";
import { createSqliteInventoryRepository } from "../../../inventory/infrastructure/sqlite/inventory-repository";
import { createSqlitePermanentBonusesPort } from "../../../inventory/infrastructure/sqlite/permanent-bonuses-service";
import { createSqlitePvpRepository } from "../../../pvp/infrastructure/sqlite/pvp-repository";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";

export const createSqliteQueryDiceStatsUseCase = (db: SqliteDatabase) => {
  const analytics = createSqliteAnalyticsRepository(db);
  const economy = createSqliteEconomyRepository(db);
  const garden = createSqliteGardenRepository(db);
  const inventory = createSqliteInventoryRepository(db);
  const itemEffects = createSqliteDiceItemEffectsService(db);
  const permanentBonuses = createSqlitePermanentBonusesPort(db);
  const progression = createSqliteProgressionRepository(db);
  const pvp = createSqlitePvpRepository(db);

  return createQueryDiceStatsUseCase({
    analytics,
    economy,
    garden,
    inventory,
    itemEffects,
    permanentBonuses,
    progression,
    pvp,
  });
};
