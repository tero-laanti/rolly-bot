import type { SqliteDatabase } from "../../../../shared/db";
import { createSqlitePermanentBonusesPort } from "../../../inventory/infrastructure/sqlite/permanent-bonuses-service";
import type { DiceEconomyRepository } from "../../application/ports";
import type {
  DailyPipGrantResult,
  EconomyChange,
  EconomyLeaderboardEntry,
  EconomySnapshot,
  RewardPipGrantResult,
} from "../../domain/balance";

const getEconomySnapshot = (db: SqliteDatabase, userId: string): EconomySnapshot => {
  const row = db.prepare("SELECT fame, pips FROM balances WHERE user_id = ?").get(userId) as
    | EconomySnapshot
    | undefined;

  return {
    fame: row?.fame ?? 0,
    pips: row?.pips ?? 0,
  };
};

const getLastDailyPipRewardAt = (db: SqliteDatabase, userId: string): string | null => {
  const row = db
    .prepare("SELECT last_daily_pip_reward_at FROM balances WHERE user_id = ?")
    .get(userId) as
    | {
        last_daily_pip_reward_at: string | null;
      }
    | undefined;

  return row?.last_daily_pip_reward_at ?? null;
};

const leaderboardQueries: Record<"fame" | "pips", string> = {
  fame: `
    SELECT user_id AS userId, fame, pips
    FROM balances
    WHERE fame > 0 OR pips > 0
    ORDER BY fame DESC, COALESCE(fame_updated_at, updated_at) ASC, user_id ASC
    LIMIT ?
  `,
  pips: `
    SELECT user_id AS userId, fame, pips
    FROM balances
    WHERE fame > 0 OR pips > 0
    ORDER BY pips DESC, fame DESC, user_id ASC
    LIMIT ?
  `,
};

const getTopBalanceEntries = (
  db: SqliteDatabase,
  input: {
    metric: "fame" | "pips";
    limit: number;
  },
): EconomyLeaderboardEntry[] => {
  const safeLimit = Math.max(1, Math.floor(input.limit));
  return db.prepare(leaderboardQueries[input.metric]).all(safeLimit) as EconomyLeaderboardEntry[];
};

const getFame = (db: SqliteDatabase, userId: string): number => {
  return getEconomySnapshot(db, userId).fame;
};

const getPips = (db: SqliteDatabase, userId: string): number => {
  return getEconomySnapshot(db, userId).pips;
};

const applyFameDelta = (db: SqliteDatabase, { userId, amount }: EconomyChange): number => {
  const updatedAt = new Date().toISOString();
  const upsert = db.prepare(
    `
    INSERT INTO balances (user_id, fame, fame_updated_at, updated_at)
    VALUES (@userId, @amount, @updatedAt, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET
      fame = fame + excluded.fame,
      fame_updated_at = excluded.fame_updated_at,
      updated_at = excluded.updated_at
  `,
  );
  const select = db.prepare("SELECT fame FROM balances WHERE user_id = ?");

  return db.transaction(() => {
    upsert.run({ userId, amount, updatedAt });
    const row = select.get(userId) as { fame: number } | undefined;
    return row?.fame ?? 0;
  })();
};

const applyPipsDelta = (db: SqliteDatabase, { userId, amount }: EconomyChange): number => {
  const updatedAt = new Date().toISOString();
  const upsert = db.prepare(
    `
    INSERT INTO balances (user_id, pips, updated_at)
    VALUES (@userId, @amount, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET pips = pips + excluded.pips, updated_at = excluded.updated_at
  `,
  );
  const select = db.prepare("SELECT pips FROM balances WHERE user_id = ?");

  return db.transaction(() => {
    upsert.run({ userId, amount, updatedAt });
    const row = select.get(userId) as { pips: number } | undefined;
    return row?.pips ?? 0;
  })();
};

const getUtcDayKey = (value: string): string => {
  return value.slice(0, 10);
};

const getRewardAmountWithPermanentBonuses = (
  db: SqliteDatabase,
  userId: string,
  baseAmount: number,
): number => {
  const permanentBonuses = createSqlitePermanentBonusesPort(db).getPermanentBonuses(userId);
  const normalizedBaseAmount = Math.max(0, Math.floor(baseAmount));
  if (normalizedBaseAmount < 1) {
    return 0;
  }

  return (
    normalizedBaseAmount +
    Math.floor((normalizedBaseAmount * permanentBonuses.pipRewardBonusPercent) / 100)
  );
};

const grantRewardPips = (
  db: SqliteDatabase,
  {
    userId,
    baseAmount,
  }: {
    userId: string;
    baseAmount: number;
  },
): RewardPipGrantResult => {
  const awardedAmount = getRewardAmountWithPermanentBonuses(db, userId, baseAmount);
  if (awardedAmount < 1) {
    return {
      awardedAmount: 0,
      pips: getPips(db, userId),
    };
  }

  return {
    awardedAmount,
    pips: applyPipsDelta(db, { userId, amount: awardedAmount }),
  };
};

const grantDailyPipsIfEligible = (
  db: SqliteDatabase,
  {
    userId,
    amount,
    nowMs = Date.now(),
  }: {
    userId: string;
    amount: number;
    nowMs?: number;
  },
): DailyPipGrantResult => {
  const claimedAt = new Date(nowMs).toISOString();
  const todayKey = getUtcDayKey(claimedAt);
  const awardedAmount = getRewardAmountWithPermanentBonuses(db, userId, amount);
  const select = db.prepare(
    "SELECT pips, last_daily_pip_reward_at FROM balances WHERE user_id = ?",
  );
  const insert = db.prepare(
    `
    INSERT INTO balances (user_id, pips, last_daily_pip_reward_at, updated_at)
    VALUES (@userId, @amount, @claimedAt, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET
      pips = balances.pips + excluded.pips,
      last_daily_pip_reward_at = excluded.last_daily_pip_reward_at,
      updated_at = excluded.updated_at
  `,
  );

  return db.transaction(() => {
    const existing = select.get(userId) as
      | {
          pips: number;
          last_daily_pip_reward_at: string | null;
        }
      | undefined;
    const lastClaimedAt = existing?.last_daily_pip_reward_at ?? null;
    if (lastClaimedAt && getUtcDayKey(lastClaimedAt) === todayKey) {
      return {
        awarded: false,
        awardedAmount: 0,
        pips: existing?.pips ?? 0,
        lastDailyPipRewardAt: lastClaimedAt,
      };
    }

    insert.run({
      userId,
      amount: awardedAmount,
      claimedAt,
      updatedAt: claimedAt,
    });
    const updated = select.get(userId) as
      | {
          pips: number;
          last_daily_pip_reward_at: string | null;
        }
      | undefined;

    return {
      awarded: true,
      awardedAmount,
      pips: updated?.pips ?? awardedAmount,
      lastDailyPipRewardAt: updated?.last_daily_pip_reward_at ?? claimedAt,
    };
  })();
};

export const createSqliteEconomyRepository = (db: SqliteDatabase): DiceEconomyRepository => {
  return {
    getEconomySnapshot: (userId) => getEconomySnapshot(db, userId),
    getTopBalanceEntries: (input) => getTopBalanceEntries(db, input),
    getFame: (userId) => getFame(db, userId),
    getPips: (userId) => getPips(db, userId),
    getLastDailyPipRewardAt: (userId) => getLastDailyPipRewardAt(db, userId),
    applyFameDelta: (change) => applyFameDelta(db, change),
    applyPipsDelta: (change) => applyPipsDelta(db, change),
    grantRewardPips: (input) => grantRewardPips(db, input),
    grantDailyPipsIfEligible: (input) => grantDailyPipsIfEligible(db, input),
  };
};
