import { minutesToMs, secondsToMs } from "./time";

export const databasePath = "data/rolly-bot.sqlite";

type QuietHoursConfig = {
  start: string;
  end: string;
  timezone: string;
};

export type RandomEventsFoundationConfig = {
  enabled: boolean;
  inactiveReason: string | null;
  channelId: string | null;
  targetEventsPerDay: number;
  minGapMs: number;
  maxActiveEvents: number;
  retryDelayMs: number;
  jitterRatio: number;
  quietHours: QuietHoursConfig;
};

export type RaidsConfig = {
  enabled: boolean;
  inactiveReason: string | null;
  channelId: string | null;
  joinLeadMs: number;
  activeDurationMs: number;
  targetRaidsPerDay: number;
  minGapMs: number;
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

const resolveFeatureActivation = ({
  channelId,
  channelEnvName,
}: {
  channelId: string | null;
  channelEnvName: string;
}): { enabled: boolean; inactiveReason: string | null } => {
  if (!channelId) {
    return {
      enabled: false,
      inactiveReason: `${channelEnvName} is not set.`,
    };
  }

  return {
    enabled: true,
    inactiveReason: null,
  };
};

const defaultRandomEventsConfig = {
  targetEventsPerDay: 10,
  minGapMinutes: 45,
  maxActiveEvents: 1,
  retryDelaySeconds: 5 * 60,
  jitterRatio: 0.35,
  quietHours: {
    start: "23:00",
    end: "08:00",
    timezone: "Europe/Helsinki",
  },
};

const defaultRaidsConfig = {
  joinLeadMinutes: 30,
  activeDurationMinutes: 12,
  targetRaidsPerDay: 0,
  minGapMinutes: 180,
  retryDelaySeconds: 10 * 60,
  jitterRatio: 0.35,
  quietHours: {
    start: "23:00",
    end: "08:00",
    timezone: "Europe/Helsinki",
  },
};

const randomEventsChannelId = parseOptionalString(process.env.RANDOM_EVENTS_CHANNEL_ID);
const randomEventsActivation = resolveFeatureActivation({
  channelId: randomEventsChannelId,
  channelEnvName: "RANDOM_EVENTS_CHANNEL_ID",
});

export const randomEventsFoundationConfig: RandomEventsFoundationConfig = {
  enabled: randomEventsActivation.enabled,
  inactiveReason: randomEventsActivation.inactiveReason,
  channelId: randomEventsChannelId,
  targetEventsPerDay: parseNumberWithFallback(
    process.env.RANDOM_EVENTS_TARGET_PER_DAY,
    defaultRandomEventsConfig.targetEventsPerDay,
    1,
  ),
  minGapMs: minutesToMs(
    parseNumberWithFallback(
      process.env.RANDOM_EVENTS_MIN_GAP_MINUTES,
      defaultRandomEventsConfig.minGapMinutes,
      1,
    ),
  ),
  maxActiveEvents: parseNumberWithFallback(
    process.env.RANDOM_EVENTS_MAX_ACTIVE,
    defaultRandomEventsConfig.maxActiveEvents,
    1,
  ),
  retryDelayMs: secondsToMs(
    parseNumberWithFallback(
      process.env.RANDOM_EVENTS_RETRY_DELAY_SECONDS,
      defaultRandomEventsConfig.retryDelaySeconds,
      15,
    ),
  ),
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

const raidsChannelId = parseOptionalString(process.env.RAIDS_CHANNEL_ID);
const raidsActivation = resolveFeatureActivation({
  channelId: raidsChannelId,
  channelEnvName: "RAIDS_CHANNEL_ID",
});

export const raidsConfig: RaidsConfig = {
  enabled: raidsActivation.enabled,
  inactiveReason: raidsActivation.inactiveReason,
  channelId: raidsChannelId,
  joinLeadMs: minutesToMs(
    parseNumberWithFallback(
      process.env.RAIDS_JOIN_LEAD_MINUTES,
      defaultRaidsConfig.joinLeadMinutes,
      1,
    ),
  ),
  activeDurationMs: minutesToMs(
    parseNumberWithFallback(
      process.env.RAIDS_ACTIVE_DURATION_MINUTES,
      defaultRaidsConfig.activeDurationMinutes,
      1,
    ),
  ),
  targetRaidsPerDay: parseNumberWithFallback(
    process.env.RAIDS_TARGET_PER_DAY,
    defaultRaidsConfig.targetRaidsPerDay,
    0,
  ),
  minGapMs: minutesToMs(
    parseNumberWithFallback(process.env.RAIDS_MIN_GAP_MINUTES, defaultRaidsConfig.minGapMinutes, 1),
  ),
  retryDelayMs: secondsToMs(
    parseNumberWithFallback(
      process.env.RAIDS_RETRY_DELAY_SECONDS,
      defaultRaidsConfig.retryDelaySeconds,
      15,
    ),
  ),
  jitterRatio: Math.min(
    0.95,
    parseNumberWithFallback(process.env.RAIDS_JITTER_RATIO, defaultRaidsConfig.jitterRatio, 0),
  ),
  quietHours: {
    start: parseQuietHoursValue(
      process.env.RAIDS_QUIET_HOURS_START,
      defaultRaidsConfig.quietHours.start,
    ),
    end: parseQuietHoursValue(process.env.RAIDS_QUIET_HOURS_END, defaultRaidsConfig.quietHours.end),
    timezone: parseQuietHoursTimezone(
      process.env.RAIDS_QUIET_HOURS_TIMEZONE,
      defaultRaidsConfig.quietHours.timezone,
    ),
  },
};
