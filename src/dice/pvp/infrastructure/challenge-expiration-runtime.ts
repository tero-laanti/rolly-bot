import type { SqliteDatabase } from "../../../shared/db";
import { minuteMs } from "../../../shared/time";
import { createSqliteUnitOfWork } from "../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteEconomyRepository } from "../../economy/infrastructure/sqlite/balance-repository";
import { expireExpiredPendingChallenges } from "../application/challenge-expiration";
import { createSqlitePvpRepository } from "./sqlite/pvp-repository";

type DicePvpChallengeExpirationLogger = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type DicePvpChallengeExpirationTimingHooks = {
  nowMs: () => number;
  setTimeoutFn: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn: (timer: ReturnType<typeof setTimeout>) => void;
};

export type StartDicePvpChallengeExpirationRuntimeInput = {
  db: SqliteDatabase;
  logger?: DicePvpChallengeExpirationLogger;
  intervalMs?: number;
  timingHooks?: Partial<DicePvpChallengeExpirationTimingHooks>;
};

export type DicePvpChallengeExpirationRuntimeController = {
  stop: () => void;
};

const defaultTimingHooks: DicePvpChallengeExpirationTimingHooks = {
  nowMs: () => Date.now(),
  setTimeoutFn: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeoutFn: (timer) => clearTimeout(timer),
};

export const defaultDicePvpChallengeExpirationIntervalMs = minuteMs;

export const sweepExpiredPendingDicePvpChallenges = (
  db: SqliteDatabase,
  nowMs: number = Date.now(),
) => {
  return expireExpiredPendingChallenges({
    economy: createSqliteEconomyRepository(db),
    pvp: createSqlitePvpRepository(db),
    unitOfWork: createSqliteUnitOfWork(db),
    nowMs,
  });
};

export const startDicePvpChallengeExpirationRuntime = ({
  db,
  logger,
  intervalMs = defaultDicePvpChallengeExpirationIntervalMs,
  timingHooks,
}: StartDicePvpChallengeExpirationRuntimeInput): DicePvpChallengeExpirationRuntimeController => {
  const hooks: DicePvpChallengeExpirationTimingHooks = {
    ...defaultTimingHooks,
    ...timingHooks,
  };

  let stopped = false;
  let nextTimer: ReturnType<typeof setTimeout> | null = null;

  const clearScheduledTimer = (): void => {
    if (!nextTimer) {
      return;
    }

    hooks.clearTimeoutFn(nextTimer);
    nextTimer = null;
  };

  const scheduleNextSweep = (): void => {
    if (stopped) {
      clearScheduledTimer();
      return;
    }

    clearScheduledTimer();
    nextTimer = hooks.setTimeoutFn(
      () => {
        runSweep();
      },
      Math.max(1, Math.round(intervalMs)),
    );
  };

  const runSweep = (): void => {
    if (stopped) {
      return;
    }

    try {
      const expiredChallenges = sweepExpiredPendingDicePvpChallenges(db, hooks.nowMs());
      if (expiredChallenges.length > 0) {
        logger?.info(
          `[pvp] Expired ${expiredChallenges.length} pending challenge${expiredChallenges.length === 1 ? "" : "s"} and refunded challenger escrow.`,
        );
      }
    } catch (error) {
      logger?.error("[pvp] Failed to expire pending challenges:", error);
    } finally {
      scheduleNextSweep();
    }
  };

  runSweep();

  return {
    stop: () => {
      stopped = true;
      clearScheduledTimer();
    },
  };
};
