import type { SqliteDatabase } from "../../../../shared/db";
import { createDiceAdminUseCase } from "../../application/manage-admin/use-case";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createSqlitePvpRepository } from "../../../pvp/infrastructure/sqlite/pvp-repository";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";
import { randomEventsAdminPort } from "../../../random-events/infrastructure/admin-controller";
import { worldBossAdminPort } from "../../../world-boss/infrastructure/admin-controller";

export const createSqliteDiceAdminUseCase = (db: SqliteDatabase) => {
  return createDiceAdminUseCase({
    economy: createSqliteEconomyRepository(db),
    progression: createSqliteProgressionRepository(db),
    pvp: createSqlitePvpRepository(db),
    randomEventsAdmin: randomEventsAdminPort,
    worldBossAdmin: worldBossAdminPort,
  });
};
