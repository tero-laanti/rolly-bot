import type { RaidQuietHoursConfig, TriggerRaidNowOutcome } from "../application/ports";
import type { RaidsConfig } from "../../../shared/config";
import { dayMs } from "../../../shared/time";
import { getLastRaidTriggeredAt, setLastRaidTriggeredAt, type RaidsState } from "./state-store";

type RaidsFoundationLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type SchedulerTimingHooks = {
  now: () => Date;
  random: () => number;
  setTimeoutFn: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn: (timer: ReturnType<typeof setTimeout>) => void;
};

type TriggerOpportunityContext = {
  now: Date;
};

export type RaidTriggerGateReason = "ready" | "quiet-hours" | "min-gap" | "active-raid";

export type RaidTriggerGateResult = {
  reason: RaidTriggerGateReason;
  shouldTrigger: boolean;
  retryDelayMs: number;
};

export type StartRaidsFoundationSchedulerInput = {
  config: RaidsConfig;
  state: RaidsState;
  hasBlockingRaid: () => boolean;
  onTriggerOpportunity?: (
    context: TriggerOpportunityContext,
  ) => TriggerRaidNowOutcome | Promise<TriggerRaidNowOutcome>;
  logger?: RaidsFoundationLogger;
  timingHooks?: Partial<SchedulerTimingHooks>;
};

export type RaidsFoundationSchedulerController = {
  stop: () => void;
  getNextCheckAt: () => Date | null;
};

const defaultTimingHooks: SchedulerTimingHooks = {
  now: () => new Date(),
  random: () => Math.random(),
  setTimeoutFn: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeoutFn: (timer) => clearTimeout(timer),
};

const parseClockToMinutes = (clock: string): number | null => {
  if (clock === "24:00") {
    return 24 * 60;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getOrCreateFormatter = (timezone: string): Intl.DateTimeFormat => {
  const cachedFormatter = formatterCache.get(timezone);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, formatter);
    return formatter;
  } catch {
    const fallbackTimezone = "UTC";
    const fallbackFormatter = formatterCache.get(fallbackTimezone);
    if (fallbackFormatter) {
      return fallbackFormatter;
    }

    const createdFallbackFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: fallbackTimezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(fallbackTimezone, createdFallbackFormatter);
    return createdFallbackFormatter;
  }
};

const getMinutesInTimezone = (date: Date, timezone: string): number => {
  const formatter = getOrCreateFormatter(timezone);
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((part) => part.type === "hour")?.value;
  const minutePart = parts.find((part) => part.type === "minute")?.value;
  const hours = Number(hourPart ?? "0");
  const minutes = Number(minutePart ?? "0");
  return hours * 60 + minutes;
};

const isWithinQuietHours = (now: Date, quietHours: RaidQuietHoursConfig): boolean => {
  const startMinutes = parseClockToMinutes(quietHours.start);
  const endMinutes = parseClockToMinutes(quietHours.end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return false;
  }

  const currentMinutes = getMinutesInTimezone(now, quietHours.timezone);
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

const getRandomCadenceDelayMs = (config: RaidsConfig, random: () => number): number => {
  const baselineIntervalMs = dayMs / Math.max(1, config.targetRaidsPerDay);
  const jitterRangeMs = baselineIntervalMs * config.jitterRatio;
  const randomOffsetMs = (random() * 2 - 1) * jitterRangeMs;
  const randomizedDelayMs = baselineIntervalMs + randomOffsetMs;
  return Math.max(config.minGapMs, Math.round(randomizedDelayMs));
};

const getMinGapRetryDelayMs = (state: RaidsState, now: Date, config: RaidsConfig): number => {
  const lastTriggeredAt = getLastRaidTriggeredAt(state);
  if (!lastTriggeredAt) {
    return 0;
  }

  const elapsedMs = now.getTime() - lastTriggeredAt.getTime();
  if (elapsedMs >= config.minGapMs) {
    return 0;
  }

  return Math.max(1, config.minGapMs - elapsedMs);
};

export const evaluateRaidTrigger = (
  state: RaidsState,
  now: Date,
  config: RaidsConfig,
  hasBlockingRaid: boolean,
): RaidTriggerGateResult => {
  if (hasBlockingRaid) {
    return {
      reason: "active-raid",
      shouldTrigger: false,
      retryDelayMs: config.retryDelayMs,
    };
  }

  if (isWithinQuietHours(now, config.quietHours)) {
    return {
      reason: "quiet-hours",
      shouldTrigger: false,
      retryDelayMs: config.retryDelayMs,
    };
  }

  const minGapRetryDelayMs = getMinGapRetryDelayMs(state, now, config);
  if (minGapRetryDelayMs > 0) {
    return {
      reason: "min-gap",
      shouldTrigger: false,
      retryDelayMs: minGapRetryDelayMs,
    };
  }

  return {
    reason: "ready",
    shouldTrigger: true,
    retryDelayMs: 0,
  };
};

export const startRaidsFoundationScheduler = ({
  config,
  state,
  hasBlockingRaid,
  onTriggerOpportunity,
  logger,
  timingHooks,
}: StartRaidsFoundationSchedulerInput): RaidsFoundationSchedulerController => {
  const hooks: SchedulerTimingHooks = {
    ...defaultTimingHooks,
    ...timingHooks,
  };

  let stopped = false;
  let nextTimer: ReturnType<typeof setTimeout> | null = null;
  let nextCheckAt: Date | null = null;

  const clearScheduledTimer = (): void => {
    if (!nextTimer) {
      return;
    }

    hooks.clearTimeoutFn(nextTimer);
    nextTimer = null;
  };

  const scheduleNextRun = (delayMs: number): void => {
    if (stopped) {
      nextCheckAt = null;
      clearScheduledTimer();
      return;
    }

    clearScheduledTimer();

    const normalizedDelayMs = Math.max(1, Math.round(delayMs));
    nextCheckAt = new Date(hooks.now().getTime() + normalizedDelayMs);
    nextTimer = hooks.setTimeoutFn(() => {
      void runSchedulerIteration();
    }, normalizedDelayMs);
  };

  const runSchedulerIteration = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    const now = hooks.now();
    const gate = evaluateRaidTrigger(state, now, config, hasBlockingRaid());
    if (!gate.shouldTrigger) {
      scheduleNextRun(gate.retryDelayMs);
      return;
    }

    try {
      const triggerResult = await onTriggerOpportunity?.({ now });
      if (triggerResult?.created) {
        setLastRaidTriggeredAt(state, now);
      }
    } catch (error) {
      logger?.error("[raids] Trigger opportunity failed.", error);
      scheduleNextRun(config.retryDelayMs);
      return;
    }

    scheduleNextRun(getRandomCadenceDelayMs(config, hooks.random));
  };

  if (!config.enabled || config.targetRaidsPerDay <= 0) {
    return {
      stop: () => {
        stopped = true;
        nextCheckAt = null;
        clearScheduledTimer();
      },
      getNextCheckAt: () => null,
    };
  }

  scheduleNextRun(1);

  return {
    stop: () => {
      stopped = true;
      nextCheckAt = null;
      clearScheduledTimer();
    },
    getNextCheckAt: () => nextCheckAt,
  };
};
