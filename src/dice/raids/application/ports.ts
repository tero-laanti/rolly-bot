export type RaidStatus =
  | "joining"
  | "starting"
  | "active"
  | "cancelled"
  | "interrupted"
  | "start-failed"
  | "resolved"
  | "cleanup-needed";

export type RaidAdminLiveRaidSnapshot = {
  raidId: string;
  title: string;
  status: RaidStatus;
  participantCount: number;
  scheduledStartAt: Date;
  expiresAt: Date | null;
  channelId: string;
  announcementMessageId: string;
  activeMessageId: string | null;
};

export type RaidAdminStateSnapshot = {
  liveRaidCount: number;
};

export type RaidAdminStatus = {
  enabled: boolean;
  channelId: string | null;
  joinLeadMs: number;
  activeDurationMs: number;
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
