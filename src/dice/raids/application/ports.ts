export type RaidStatus = "joining" | "active";

export type RaidAdminActiveRaidSnapshot = {
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
  activeRaidCount: number;
};

export type RaidAdminStatus = {
  enabled: boolean;
  channelId: string | null;
  joinLeadMs: number;
  activeDurationMs: number;
  snapshot: RaidAdminStateSnapshot;
  activeRaids: RaidAdminActiveRaidSnapshot[];
};

export type TriggerRaidNowResult =
  | {
      ok: false;
      reason: "unavailable" | "disabled" | "active-raid-exists";
    }
  | {
      ok: true;
      result:
        | {
            created: true;
            raidId?: string;
            scheduledStartAt?: Date | null;
          }
        | {
            created: false;
          }
        | null
        | undefined;
    };

export type RaidsAdminPort = {
  getAdminStatus: () => RaidAdminStatus | null;
  triggerRaidNow: () => Promise<TriggerRaidNowResult>;
};
