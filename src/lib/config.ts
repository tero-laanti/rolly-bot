export const databasePath = "data/rolly-bot.sqlite";

type QuietHoursConfig = {
  start: string;
  end: string;
  timezone: string;
};

export type RandomEventsFoundationConfig = {
  enabled: boolean;
  channelId: string | null;
  targetEventsPerDay: number;
  minGapMs: number;
  maxActiveEvents: number;
  retryDelayMs: number;
  jitterRatio: number;
  quietHours: QuietHoursConfig;
};

const parseNumberWithFallback = (
  rawValue: string | undefined,
  fallback: number,
  minValue: number,
): number => {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minValue, parsed);
};

const parseBooleanWithFallback = (rawValue: string | undefined, fallback: boolean): boolean => {
  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseQuietHoursValue = (rawValue: string | undefined, fallback: string): string => {
  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim();
  const quietHoursPattern = /^((([01]\d|2[0-3]):[0-5]\d)|(24:00))$/;
  if (!quietHoursPattern.test(normalized)) {
    return fallback;
  }

  return normalized;
};

const parseQuietHoursTimezone = (rawValue: string | undefined, fallback: string): string => {
  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim();
  if (normalized.length < 1) {
    return fallback;
  }

  return normalized;
};

const parseOptionalString = (rawValue: string | undefined): string | null => {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : null;
};

const defaultRandomEventsConfig: RandomEventsFoundationConfig = {
  enabled: true,
  channelId: null,
  targetEventsPerDay: 10,
  minGapMs: 45 * 60 * 1_000,
  maxActiveEvents: 1,
  retryDelayMs: 5 * 60 * 1_000,
  jitterRatio: 0.35,
  quietHours: {
    start: "23:00",
    end: "08:00",
    timezone: "Europe/Helsinki",
  },
};

export const randomEventsFoundationConfig: RandomEventsFoundationConfig = {
  enabled: parseBooleanWithFallback(
    process.env.RANDOM_EVENTS_ENABLED,
    defaultRandomEventsConfig.enabled,
  ),
  channelId: parseOptionalString(process.env.RANDOM_EVENTS_CHANNEL_ID),
  targetEventsPerDay: parseNumberWithFallback(
    process.env.RANDOM_EVENTS_TARGET_PER_DAY,
    defaultRandomEventsConfig.targetEventsPerDay,
    1,
  ),
  minGapMs:
    parseNumberWithFallback(
      process.env.RANDOM_EVENTS_MIN_GAP_MINUTES,
      defaultRandomEventsConfig.minGapMs / 60_000,
      1,
    ) * 60_000,
  maxActiveEvents: parseNumberWithFallback(
    process.env.RANDOM_EVENTS_MAX_ACTIVE,
    defaultRandomEventsConfig.maxActiveEvents,
    1,
  ),
  retryDelayMs:
    parseNumberWithFallback(
      process.env.RANDOM_EVENTS_RETRY_DELAY_SECONDS,
      defaultRandomEventsConfig.retryDelayMs / 1_000,
      15,
    ) * 1_000,
  jitterRatio: Math.min(
    0.95,
    parseNumberWithFallback(
      process.env.RANDOM_EVENTS_JITTER_RATIO,
      defaultRandomEventsConfig.jitterRatio,
      0,
    ),
  ),
  quietHours: {
    start: parseQuietHoursValue(
      process.env.RANDOM_EVENTS_QUIET_HOURS_START,
      defaultRandomEventsConfig.quietHours.start,
    ),
    end: parseQuietHoursValue(
      process.env.RANDOM_EVENTS_QUIET_HOURS_END,
      defaultRandomEventsConfig.quietHours.end,
    ),
    timezone: parseQuietHoursTimezone(
      process.env.RANDOM_EVENTS_QUIET_HOURS_TIMEZONE,
      defaultRandomEventsConfig.quietHours.timezone,
    ),
  },
};
