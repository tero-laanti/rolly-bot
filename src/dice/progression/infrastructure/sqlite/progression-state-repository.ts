import type { SqliteDatabase } from "../../../../shared/db";
import type {
  DiceCountByPrestigeUpdate,
  DiceCountUpdate,
  DicePrestigeLeaderboardEntry,
  DicePrestigeUpdate,
  DiceProgressionRepository,
} from "../../application/ports";
import {
  getDicePrestigeBaseDiceCount,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "../../domain/game-rules";

const normalizePrestige = (prestige: number): number => {
  return Math.min(getMaxDicePrestige(), Math.max(0, Math.floor(prestige)));
};

const normalizeDiceCount = (diceCount: number): number => {
  return Math.max(1, Math.floor(diceCount));
};

export const createSqliteProgressionStateRepository = (
  db: SqliteDatabase,
): Pick<
  DiceProgressionRepository,
  | "getDiceCount"
  | "getDiceCountForPrestige"
  | "setDiceCount"
  | "setDiceCountForPrestige"
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
          SELECT user_id FROM dice_counts_by_prestige
        )
        SELECT
          tracked_users.user_id AS userId,
          COALESCE(dice_prestige.prestige, 0) AS prestige,
          COALESCE(highest_dice_count.dice_count, 1) AS diceCount
        FROM tracked_users
        LEFT JOIN dice_prestige
          ON dice_prestige.user_id = tracked_users.user_id
        LEFT JOIN dice_counts_by_prestige AS highest_dice_count
          ON highest_dice_count.user_id = tracked_users.user_id
         AND highest_dice_count.prestige = COALESCE(dice_prestige.prestige, 0)
        ORDER BY
          COALESCE(dice_prestige.prestige, 0) DESC,
          COALESCE(highest_dice_count.dice_count, 1) DESC,
          COALESCE(highest_dice_count.updated_at, dice_prestige.updated_at) ASC,
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

  const setDiceCountForPrestige = ({
    userId,
    prestige,
    diceCount,
  }: DiceCountByPrestigeUpdate): void => {
    const updatedAt = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO dice_counts_by_prestige (user_id, prestige, dice_count, updated_at)
      VALUES (@userId, @prestige, @diceCount, @updatedAt)
      ON CONFLICT(user_id, prestige)
      DO UPDATE SET dice_count = excluded.dice_count, updated_at = excluded.updated_at
    `,
    ).run({
      userId,
      prestige: normalizePrestige(prestige),
      diceCount: normalizeDiceCount(diceCount),
      updatedAt,
    });
  };

  const getDiceCountForPrestige = (userId: string, prestige: number): number => {
    const normalizedPrestige = normalizePrestige(prestige);
    const highestPrestige = getDicePrestige(userId);
    const row = db
      .prepare("SELECT dice_count FROM dice_counts_by_prestige WHERE user_id = ? AND prestige = ?")
      .get(userId, normalizedPrestige) as { dice_count: number } | undefined;

    if (row) {
      const normalizedValue = normalizeDiceCount(row.dice_count);
      if (
        normalizedPrestige < highestPrestige &&
        normalizedValue < getDicePrestigeBaseDiceCount()
      ) {
        setDiceCountForPrestige({
          userId,
          prestige: normalizedPrestige,
          diceCount: getDicePrestigeBaseDiceCount(),
        });
        return getDicePrestigeBaseDiceCount();
      }

      return normalizedValue;
    }

    const initialDiceCount =
      normalizedPrestige === highestPrestige ? 1 : getDicePrestigeBaseDiceCount();
    setDiceCountForPrestige({
      userId,
      prestige: normalizedPrestige,
      diceCount: initialDiceCount,
    });
    return initialDiceCount;
  };

  const getDiceCount = (userId: string): number => {
    return getDiceCountForPrestige(userId, getActiveDicePrestige(userId));
  };

  const setDiceCount = ({ userId, diceCount }: DiceCountUpdate): void => {
    setDiceCountForPrestige({
      userId,
      prestige: getActiveDicePrestige(userId),
      diceCount,
    });
  };

  const isOnHighestDicePrestige = (userId: string): boolean => {
    return getActiveDicePrestige(userId) === getDicePrestige(userId);
  };

  const getDiceSides = (userId: string): number => {
    return getDiceSidesForPrestige(getActiveDicePrestige(userId));
  };

  return {
    getDiceCount,
    getDiceCountForPrestige,
    setDiceCount,
    setDiceCountForPrestige,
    getDicePrestige,
    getTopPrestigeEntries,
    setDicePrestige,
    getActiveDicePrestige,
    setActiveDicePrestige,
    isOnHighestDicePrestige,
    getDiceSides,
  };
};
