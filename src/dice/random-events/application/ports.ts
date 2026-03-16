import type { RandomEventClaimPolicy } from "../domain/claim-policy";
import type { RandomEventRarityTier } from "../domain/variety";

export type RandomEventsAdminActiveEventSnapshot = {
  eventId: string;
  title: string;
  rarity: RandomEventRarityTier;
  claimPolicy: RandomEventClaimPolicy;
  participantCount: number;
  expiresAt: Date | null;
  channelId: string;
  messageId: string;
};

export type RandomEventsAdminGateReason = "ready" | "quiet-hours" | "min-gap" | "max-active";

export type RandomEventsAdminGateResult = {
  reason: RandomEventsAdminGateReason;
  shouldTrigger: boolean;
  retryDelayMs: number;
};

export type RandomEventsAdminStateSnapshot = {
  activeEventCount: number;
  lastTriggeredAt: Date | null;
};

export type RandomEventsAdminStatus = {
  enabled: boolean;
  channelId: string | null;
  nextCheckAt: Date | null;
  gate: RandomEventsAdminGateResult;
  snapshot: RandomEventsAdminStateSnapshot;
  activeEvents: RandomEventsAdminActiveEventSnapshot[];
};

export type TriggerRandomEventNowResult =
  | {
      ok: false;
      reason: "unavailable" | "disabled" | "active-event-exists";
    }
  | {
      ok: true;
      result:
        | {
            created: true;
            eventId?: string;
            expiresAt?: Date | null;
          }
        | {
            created: false;
          }
        | null
        | undefined;
    };

export type RandomEventsAdminPort = {
  getAdminStatus: () => RandomEventsAdminStatus | null;
  triggerEventNow: () => Promise<TriggerRandomEventNowResult>;
  triggerGroupEventNow: () => Promise<TriggerRandomEventNowResult>;
};
