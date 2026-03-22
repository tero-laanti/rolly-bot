import type { SqliteDatabase } from "../../../../shared/db";
import type {
  DiceLevelByPrestigeUpdate,
  DicePrestigeLeaderboardEntry,
  DiceLevelUpdate,
  DicePrestigeUpdate,
  DiceProgressionRepository,
} from "../../application/ports";
import {
  getDicePrestigeBaseLevel,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "../../domain/game-rules";

const normalizePrestige = (prestige: number): number => {
  return Math.min(getMaxDicePrestige(), Math.max(0, Math.floor(prestige)));
};

const normalizeLevel = (level: number): number => {
  return Math.max(1, Math.floor(level));
};

export const createSqliteProgressionStateRepository = (
  db: SqliteDatabase,
): Pick<
  DiceProgressionRepository,
  | "getDiceLevel"
  | "getDiceLevelForPrestige"
  | "setDiceLevel"
  | "setDiceLevelForPrestige"
  | "getDicePrestige"
  | "getTopPrestigeEntries"
  | "setDicePrestige"
  | "getActiveDicePrestige"
  | "setActiveDicePrestige"
  | "isOnHighestDicePrestige"
  | "getDiceSides"
> => {
  const getDicePrestige = (userId: string): number => {
    const row = db.prepare("SELECT prestige FROM dice_prestige WHERE user_id = ?").get(userId) as
      | { prestige: number }
      | undefined;

    return normalizePrestige(row?.prestige ?? 0);
  };

  const normalizeActivePrestige = (prestige: number, highestPrestige: number): number => {
    return Math.min(normalizePrestige(highestPrestige), normalizePrestige(prestige));
  };

  const setDicePrestige = ({ userId, prestige }: DicePrestigeUpdate): void => {
    const updatedAt = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO dice_prestige (user_id, prestige, updated_at)
      VALUES (@userId, @prestige, @updatedAt)
      ON CONFLICT(user_id)
      DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
    `,
    ).run({
      userId,
      prestige: normalizePrestige(prestige),
      updatedAt,
    });
  };

  const getTopPrestigeEntries = (limit: number): DicePrestigeLeaderboardEntry[] => {
    const safeLimit = Math.max(1, Math.floor(limit));
    return db
      .prepare(
        `
        WITH tracked_users AS (
          SELECT user_id FROM dice_prestige
          UNION
          SELECT user_id FROM dice_levels_by_prestige
        )
        SELECT
          tracked_users.user_id AS userId,
          COALESCE(dice_prestige.prestige, 0) AS prestige,
          COALESCE(highest_level.level, 1) AS level
        FROM tracked_users
        LEFT JOIN dice_prestige
          ON dice_prestige.user_id = tracked_users.user_id
        LEFT JOIN dice_levels_by_prestige AS highest_level
          ON highest_level.user_id = tracked_users.user_id
         AND highest_level.prestige = COALESCE(dice_prestige.prestige, 0)
        ORDER BY
          COALESCE(dice_prestige.prestige, 0) DESC,
          COALESCE(highest_level.level, 1) DESC,
          COALESCE(highest_level.updated_at, dice_prestige.updated_at) ASC,
          tracked_users.user_id ASC
        LIMIT ?
      `,
      )
      .all(safeLimit) as DicePrestigeLeaderboardEntry[];
  };

  const setActiveDicePrestige = ({ userId, prestige }: DicePrestigeUpdate): void => {
    const highestPrestige = getDicePrestige(userId);
    const updatedAt = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO dice_active_prestige (user_id, prestige, updated_at)
      VALUES (@userId, @prestige, @updatedAt)
      ON CONFLICT(user_id)
      DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
    `,
    ).run({
      userId,
      prestige: normalizeActivePrestige(prestige, highestPrestige),
      updatedAt,
    });
  };

  const getActiveDicePrestige = (userId: string): number => {
    const highestPrestige = getDicePrestige(userId);
    const row = db
      .prepare("SELECT prestige FROM dice_active_prestige WHERE user_id = ?")
      .get(userId) as { prestige: number } | undefined;

    if (!row) {
      return highestPrestige;
    }

    const normalizedActive = normalizeActivePrestige(row.prestige, highestPrestige);
    if (normalizedActive !== row.prestige) {
      setActiveDicePrestige({ userId, prestige: normalizedActive });
    }

    return normalizedActive;
  };

  const setDiceLevelForPrestige = ({
    userId,
    prestige,
    level,
  }: DiceLevelByPrestigeUpdate): void => {
    const updatedAt = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO dice_levels_by_prestige (user_id, prestige, level, updated_at)
      VALUES (@userId, @prestige, @level, @updatedAt)
      ON CONFLICT(user_id, prestige)
      DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at
    `,
    ).run({
      userId,
      prestige: normalizePrestige(prestige),
      level: normalizeLevel(level),
      updatedAt,
    });
  };

  const getDiceLevelForPrestige = (userId: string, prestige: number): number => {
    const normalizedPrestige = normalizePrestige(prestige);
    const highestPrestige = getDicePrestige(userId);
    const row = db
      .prepare("SELECT level FROM dice_levels_by_prestige WHERE user_id = ? AND prestige = ?")
      .get(userId, normalizedPrestige) as { level: number } | undefined;

    if (row) {
      const normalizedValue = normalizeLevel(row.level);
      if (normalizedPrestige < highestPrestige && normalizedValue < getDicePrestigeBaseLevel()) {
        setDiceLevelForPrestige({
          userId,
          prestige: normalizedPrestige,
          level: getDicePrestigeBaseLevel(),
        });
        return getDicePrestigeBaseLevel();
      }

      return normalizedValue;
    }

    const initialLevel = normalizedPrestige === highestPrestige ? 1 : getDicePrestigeBaseLevel();
    setDiceLevelForPrestige({
      userId,
      prestige: normalizedPrestige,
      level: initialLevel,
    });
    return initialLevel;
  };

  const getDiceLevel = (userId: string): number => {
    return getDiceLevelForPrestige(userId, getActiveDicePrestige(userId));
  };

  const setDiceLevel = ({ userId, level }: DiceLevelUpdate): void => {
    setDiceLevelForPrestige({
      userId,
      prestige: getActiveDicePrestige(userId),
      level,
    });
  };

  const isOnHighestDicePrestige = (userId: string): boolean => {
    return getActiveDicePrestige(userId) === getDicePrestige(userId);
  };

  const getDiceSides = (userId: string): number => {
    return getDiceSidesForPrestige(getActiveDicePrestige(userId));
  };

  return {
    getDiceLevel,
    getDiceLevelForPrestige,
    setDiceLevel,
    setDiceLevelForPrestige,
    getDicePrestige,
    getTopPrestigeEntries,
    setDicePrestige,
    getActiveDicePrestige,
    setActiveDicePrestige,
    isOnHighestDicePrestige,
    getDiceSides,
  };
};
