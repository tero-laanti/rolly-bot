import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceProgressionRepository } from "../../application/ports";
import { createSqliteProgressionAchievementsRepository } from "./progression-achievements-repository";
import { createSqliteProgressionAchievementStatsRepository } from "./progression-achievement-stats-repository";
import { createSqliteProgressionBansRepository } from "./progression-bans-repository";
import { createSqliteProgressionChargeRepository } from "./progression-charge-repository";
import { createSqliteProgressionStateRepository } from "./progression-state-repository";
import { createSqliteProgressionTemporaryEffectsRepository } from "./progression-temporary-effects-repository";

export const createSqliteProgressionRepository = (
  db: SqliteDatabase,
): DiceProgressionRepository => {
  return {
    ...createSqliteProgressionStateRepository(db),
    ...createSqliteProgressionBansRepository(db),
    ...createSqliteProgressionAchievementsRepository(db),
    ...createSqliteProgressionAchievementStatsRepository(db),
    ...createSqliteProgressionChargeRepository(db),
    ...createSqliteProgressionTemporaryEffectsRepository(db),
  };
};
