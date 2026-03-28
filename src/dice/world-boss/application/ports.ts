import type { AchievementAnnouncement } from "../../progression/application/achievement-announcements";

export type WorldBossStatus =
  | "joining"
  | "starting"
  | "active"
  | "cancelled"
  | "interrupted"
  | "start-failed"
  | "resolved"
  | "cleanup-needed";

export type WorldBossOutcome = "success" | "failure";

export type WorldBossQuietHoursConfig = {
  start: string;
  end: string;
  timezone: string;
};

export type WorldBossBossSnapshot = {
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  rewardSummary: string;
};

export type WorldBossAdminLiveSnapshot = {
  worldBossId: string;
  title: string;
  status: WorldBossStatus;
  outcome: WorldBossOutcome | null;
  participantCount: number;
  eligibleParticipantCount: number;
  scheduledStartAt: Date;
  expiresAt: Date | null;
  channelId: string;
  announcementMessageId: string;
  activeMessageId: string | null;
  activeThreadId: string | null;
  boss: WorldBossBossSnapshot | null;
};

export type WorldBossAdminStateSnapshot = {
  liveWorldBossCount: number;
  lastTriggeredAt: Date | null;
  nextCheckAt: Date | null;
};

export type WorldBossAdminStatus = {
  enabled: boolean;
  channelId: string | null;
  joinLeadMs: number;
  activeDurationMs: number;
  targetWorldBossesPerDay: number;
  minGapMs: number;
  retryDelayMs: number;
  quietHours: WorldBossQuietHoursConfig;
  snapshot: WorldBossAdminStateSnapshot;
  liveWorldBosses: WorldBossAdminLiveSnapshot[];
};

export type TriggerWorldBossNowOutcome =
  | {
      created: true;
      worldBossId: string;
      scheduledStartAt: Date;
    }
  | {
      created: false;
    };

export type TriggerWorldBossNowResult =
  | {
      ok: false;
      reason: "unavailable" | "disabled" | "active-world-boss-exists";
    }
  | {
      ok: true;
      result: TriggerWorldBossNowOutcome;
    };

export type WorldBossAdminPort = {
  getAdminStatus: () => WorldBossAdminStatus | null;
  triggerWorldBossNow: () => Promise<TriggerWorldBossNowResult>;
};

export type ApplyWorldBossDiceRollInput = {
  channelId: string | null;
  userId: string;
  userMention: string;
  damage: number;
  bestRollSet?: readonly number[] | null;
  nowMs?: number;
};

export type ApplyWorldBossDiceRollResult =
  | {
      kind: "no-world-boss";
    }
  | {
      kind: "ignored";
      reason: "not-joined" | "inactive";
      summary: string;
    }
  | {
      kind: "applied";
      summary: string;
      defeated: boolean;
      achievementAnnouncements?: AchievementAnnouncement[];
    };

export type WorldBossDiceRollPort = {
  applyDiceRoll: (input: ApplyWorldBossDiceRollInput) => ApplyWorldBossDiceRollResult;
};
