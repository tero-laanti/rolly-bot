import { minutesToMs, secondsToMs } from "./time";

export const databasePath = "data/rolly-bot.sqlite";

export type IntroPostsConfig = {
  enabled: boolean;
  inactiveReason: string | null;
  channelId: string | null;
};

export type AchievementsChannelConfig = {
  enabled: boolean;
  inactiveReason: string | null;
  channelId: string | null;
};

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

export type WorldBossConfig = {
  enabled: boolean;
  inactiveReason: string | null;
  channelId: string | null;
  joinLeadMs: number;
  activeDurationMs: number;
  targetWorldBossesPerDay: number;
  minGapMs: number;
  retryDelayMs: number;
  jitterRatio: number;
  quietHours: QuietHoursConfig;
};

export type ContractMasterConfig = {
  enabled: boolean;
  inactiveReason: string | null;
  channelId: string | null;
};

export type RaidTierBindingConfig = {
  panelChannelId: string;
  accessRoleId: string;
};

export type RaidTierBinding = RaidTierBindingConfig;

export type RaidsConfig = {
  enabled: boolean;
  inactiveReason: string | null;
  instanceCategoryId: string | null;
  tierBindings: Record<string, RaidTierBindingConfig>;
};

export type RaidsRuntimeConfig = RaidsConfig;

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

const parseRequiredConfigString = (rawValue: unknown, label: string): string => {
  if (typeof rawValue !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const normalized = rawValue.trim();
  if (normalized.length < 1) {
    throw new Error(`${label} must not be empty.`);
  }

  return normalized;
};

const parseRaidTierBindings = (
  rawValue: string | undefined,
): Record<string, RaidTierBindingConfig> => {
  if (!rawValue || rawValue.trim().length < 1) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue) as unknown;
  } catch (error) {
    throw new Error(
      `RAIDS_TIER_BINDINGS_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("RAIDS_TIER_BINDINGS_JSON must be a JSON object keyed by tierId.");
  }

  const bindings: Record<string, RaidTierBindingConfig> = {};
  const panelChannelIds = new Set<string>();

  for (const [tierId, value] of Object.entries(parsed)) {
    const normalizedTierId = tierId.trim();
    if (normalizedTierId.length < 1) {
      throw new Error("RAIDS_TIER_BINDINGS_JSON includes an empty tierId key.");
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(
        `RAIDS_TIER_BINDINGS_JSON.${normalizedTierId} must be an object with panelChannelId and accessRoleId.`,
      );
    }

    const panelChannelId = parseRequiredConfigString(
      (value as { panelChannelId?: unknown }).panelChannelId,
      `RAIDS_TIER_BINDINGS_JSON.${normalizedTierId}.panelChannelId`,
    );
    const accessRoleId = parseRequiredConfigString(
      (value as { accessRoleId?: unknown }).accessRoleId,
      `RAIDS_TIER_BINDINGS_JSON.${normalizedTierId}.accessRoleId`,
    );

    if (panelChannelIds.has(panelChannelId)) {
      throw new Error(
        `RAIDS_TIER_BINDINGS_JSON reuses panelChannelId ${panelChannelId}. Each tier panel channel must be unique.`,
      );
    }

    panelChannelIds.add(panelChannelId);
    bindings[normalizedTierId] = {
      panelChannelId,
      accessRoleId,
    };
  }

  return bindings;
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

const defaultWorldBossConfig = {
  joinLeadMinutes: 30,
  activeDurationMinutes: 12,
  targetWorldBossesPerDay: 0,
  minGapMinutes: 180,
  retryDelaySeconds: 10 * 60,
  jitterRatio: 0.35,
  quietHours: {
    start: "23:00",
    end: "08:00",
    timezone: "Europe/Helsinki",
  },
};

const introPostsChannelId = parseOptionalString(process.env.INTRO_POST_CHANNEL_ID);
const introPostsActivation = resolveFeatureActivation({
  channelId: introPostsChannelId,
  channelEnvName: "INTRO_POST_CHANNEL_ID",
});

export const introPostsConfig: IntroPostsConfig = {
  enabled: introPostsActivation.enabled,
  inactiveReason: introPostsActivation.inactiveReason,
  channelId: introPostsChannelId,
};

const achievementsChannelId = parseOptionalString(process.env.ACHIEVEMENTS_CHANNEL_ID);
const achievementsChannelActivation = resolveFeatureActivation({
  channelId: achievementsChannelId,
  channelEnvName: "ACHIEVEMENTS_CHANNEL_ID",
});

export const achievementsChannelConfig: AchievementsChannelConfig = {
  enabled: achievementsChannelActivation.enabled,
  inactiveReason: achievementsChannelActivation.inactiveReason,
  channelId: achievementsChannelId,
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

const worldBossChannelId = parseOptionalString(process.env.WORLD_BOSS_CHANNEL_ID);
const worldBossActivation = resolveFeatureActivation({
  channelId: worldBossChannelId,
  channelEnvName: "WORLD_BOSS_CHANNEL_ID",
});

const contractMasterChannelId = parseOptionalString(process.env.CONTRACT_MASTER_CHANNEL_ID);
const contractMasterActivation = resolveFeatureActivation({
  channelId: contractMasterChannelId,
  channelEnvName: "CONTRACT_MASTER_CHANNEL_ID",
});

export const contractMasterConfig: ContractMasterConfig = {
  enabled: contractMasterActivation.enabled,
  inactiveReason: contractMasterActivation.inactiveReason,
  channelId: contractMasterChannelId,
};

const raidsInstanceCategoryId = parseOptionalString(process.env.RAIDS_INSTANCE_CATEGORY_ID);
const raidsTierBindings = parseRaidTierBindings(process.env.RAIDS_TIER_BINDINGS_JSON);
const raidsTierBindingCount = Object.keys(raidsTierBindings).length;

const raidsActivation = (() => {
  if (!raidsInstanceCategoryId) {
    return {
      enabled: false,
      inactiveReason: "RAIDS_INSTANCE_CATEGORY_ID is not set.",
    };
  }

  if (raidsTierBindingCount < 1) {
    return {
      enabled: false,
      inactiveReason: process.env.RAIDS_TIER_BINDINGS_JSON
        ? "RAIDS_TIER_BINDINGS_JSON does not contain any tier bindings."
        : "RAIDS_TIER_BINDINGS_JSON is not set.",
    };
  }

  return {
    enabled: true,
    inactiveReason: null,
  };
})();

export const raidsConfig: RaidsConfig = {
  enabled: raidsActivation.enabled,
  inactiveReason: raidsActivation.inactiveReason,
  instanceCategoryId: raidsInstanceCategoryId,
  tierBindings: raidsTierBindings,
};

export const worldBossConfig: WorldBossConfig = {
  enabled: worldBossActivation.enabled,
  inactiveReason: worldBossActivation.inactiveReason,
  channelId: worldBossChannelId,
  joinLeadMs: minutesToMs(
    parseNumberWithFallback(
      process.env.WORLD_BOSS_JOIN_LEAD_MINUTES,
      defaultWorldBossConfig.joinLeadMinutes,
      1,
    ),
  ),
  activeDurationMs: minutesToMs(
    parseNumberWithFallback(
      process.env.WORLD_BOSS_ACTIVE_DURATION_MINUTES,
      defaultWorldBossConfig.activeDurationMinutes,
      1,
    ),
  ),
  targetWorldBossesPerDay: parseNumberWithFallback(
    process.env.WORLD_BOSS_TARGET_PER_DAY,
    defaultWorldBossConfig.targetWorldBossesPerDay,
    0,
  ),
  minGapMs: minutesToMs(
    parseNumberWithFallback(
      process.env.WORLD_BOSS_MIN_GAP_MINUTES,
      defaultWorldBossConfig.minGapMinutes,
      1,
    ),
  ),
  retryDelayMs: secondsToMs(
    parseNumberWithFallback(
      process.env.WORLD_BOSS_RETRY_DELAY_SECONDS,
      defaultWorldBossConfig.retryDelaySeconds,
      15,
    ),
  ),
  jitterRatio: Math.min(
    0.95,
    parseNumberWithFallback(
      process.env.WORLD_BOSS_JITTER_RATIO,
      defaultWorldBossConfig.jitterRatio,
      0,
    ),
  ),
  quietHours: {
    start: parseQuietHoursValue(
      process.env.WORLD_BOSS_QUIET_HOURS_START,
      defaultWorldBossConfig.quietHours.start,
    ),
    end: parseQuietHoursValue(
      process.env.WORLD_BOSS_QUIET_HOURS_END,
      defaultWorldBossConfig.quietHours.end,
    ),
    timezone: parseQuietHoursTimezone(
      process.env.WORLD_BOSS_QUIET_HOURS_TIMEZONE,
      defaultWorldBossConfig.quietHours.timezone,
    ),
  },
};
