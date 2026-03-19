export type RaidStatus =
  | "joining"
  | "starting"
  | "active"
  | "cancelled"
  | "interrupted"
  | "start-failed"
  | "resolved"
  | "cleanup-needed";

export type RaidOutcome = "success" | "failure";

export type RaidQuietHoursConfig = {
  start: string;
  end: string;
  timezone: string;
};

export type RaidBossSnapshot = {
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  rewardSummary: string;
};

export type RaidAdminLiveRaidSnapshot = {
  raidId: string;
  title: string;
  status: RaidStatus;
  outcome: RaidOutcome | null;
  participantCount: number;
  scheduledStartAt: Date;
  expiresAt: Date | null;
  channelId: string;
  announcementMessageId: string;
  activeMessageId: string | null;
  activeThreadId: string | null;
  boss: RaidBossSnapshot | null;
};

export type RaidAdminStateSnapshot = {
  liveRaidCount: number;
  lastTriggeredAt: Date | null;
  nextCheckAt: Date | null;
};

export type RaidAdminStatus = {
  enabled: boolean;
  channelId: string | null;
  joinLeadMs: number;
  activeDurationMs: number;
  targetRaidsPerDay: number;
  minGapMs: number;
  retryDelayMs: number;
  quietHours: RaidQuietHoursConfig;
  snapshot: RaidAdminStateSnapshot;
  liveRaids: RaidAdminLiveRaidSnapshot[];
};

export type TriggerRaidNowOutcome =
  | {
      created: true;
      raidId: string;
      scheduledStartAt: Date;
    }
  | {
      created: false;
    };

export type TriggerRaidNowResult =
  | {
      ok: false;
      reason: "unavailable" | "disabled" | "active-raid-exists";
    }
  | {
      ok: true;
      result: TriggerRaidNowOutcome;
    };

export type RaidsAdminPort = {
  getAdminStatus: () => RaidAdminStatus | null;
  triggerRaidNow: () => Promise<TriggerRaidNowResult>;
};

export type ApplyRaidDiceRollInput = {
  channelId: string | null;
  userId: string;
  userMention: string;
  damage: number;
  nowMs?: number;
};

export type ApplyRaidDiceRollResult =
  | {
      kind: "no-raid";
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
    };

export type RaidDiceRollPort = {
  applyDiceRoll: (input: ApplyRaidDiceRollInput) => ApplyRaidDiceRollResult;
};
