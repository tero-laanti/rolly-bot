import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceAnalyticsRepository } from "../../application/ports";
import {
  getDiceAnalytics,
  recordDiceRollAnalytics,
  resetDiceLevelAnalyticsProgress,
  resetDicePrestigeAnalyticsProgress,
  updateDicePvpStats,
} from "../../domain/analytics";

export const createSqliteAnalyticsRepository = (
  db: SqliteDatabase,
): DiceAnalyticsRepository => {
  return {
    getDiceAnalytics: (userId) => getDiceAnalytics(db, userId),
    recordDiceRollAnalytics: (update) => recordDiceRollAnalytics(db, update),
    resetDiceLevelAnalyticsProgress: (userId) => resetDiceLevelAnalyticsProgress(db, userId),
    resetDicePrestigeAnalyticsProgress: (userId) =>
      resetDicePrestigeAnalyticsProgress(db, userId),
    updateDicePvpStats: (update) => updateDicePvpStats(db, update),
  };
};
