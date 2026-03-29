import type { ActionView } from "../../../shared-kernel/application/action-view";
import type { RaidButtonAction } from "./manage-lobby/actions";
import type { RaidBossDefinition, RaidTierDefinition } from "../domain/catalog";
import type { RaidRunAggregate, RaidRunStatus } from "../domain/raid-run";

export type RaidCatalogReader = {
  listRaidTiers: () => readonly RaidTierDefinition[];
  getRaidTier: (tierId: string) => RaidTierDefinition | null;
  getRaidBoss: (bossId: string) => RaidBossDefinition | null;
};

export type CreateRecruitingRaidRunInput = {
  runId: string;
  tierId: string;
  bossId: string;
  leaderUserId: string;
  publicChannelId: string;
  recruitmentExpiresAt: Date;
  now: Date;
};

export type CreateRecruitingRaidRunResult =
  | {
      ok: true;
      raidRun: RaidRunAggregate;
    }
  | {
      ok: false;
      reason: "user-active-run";
    };

export type AddRaidRunMemberResult =
  | {
      ok: true;
      raidRun: RaidRunAggregate;
    }
  | {
      ok: false;
      reason:
        | "not-found"
        | "stale"
        | "not-recruiting"
        | "user-active-run"
        | "party-full"
        | "already-member";
    };

export type RemoveRaidRunMemberResult =
  | {
      ok: true;
      raidRun: RaidRunAggregate;
    }
  | {
      ok: false;
      reason: "not-found" | "stale" | "not-recruiting" | "not-member" | "leader-cannot-leave";
    };

export type UpdateRaidRunResult =
  | {
      ok: true;
      raidRun: RaidRunAggregate;
    }
  | {
      ok: false;
      reason: "not-found" | "stale" | "not-open";
    };

export type CloseRaidRunResult =
  | {
      ok: true;
      raidRun: RaidRunAggregate;
    }
  | {
      ok: false;
      reason: "not-found" | "stale";
    };

export type UpdateRaidRunStoredReferencesResult =
  | {
      ok: true;
      raidRun: RaidRunAggregate;
    }
  | {
      ok: false;
      reason: "not-found";
    };

export type RaidRunRepository = {
  getRaidRun: (runId: string) => RaidRunAggregate | null;
  getOpenRaidRunForUser: (userId: string) => RaidRunAggregate | null;
  createRecruitingRaidRun: (input: CreateRecruitingRaidRunInput) => CreateRecruitingRaidRunResult;
  addRaidRunMember: (input: {
    runId: string;
    userId: string;
    expectedVersion: number;
    now: Date;
    partySizeLimit: number;
  }) => AddRaidRunMemberResult;
  removeRaidRunMember: (input: {
    runId: string;
    userId: string;
    expectedVersion: number;
    now: Date;
  }) => RemoveRaidRunMemberResult;
  updateRaidRun: (input: {
    runId: string;
    expectedVersion: number;
    now: Date;
    status?: RaidRunStatus;
    isOpen?: boolean;
    publicMessageId?: string | null;
    privateChannelId?: string | null;
    participantRoleId?: string | null;
    encounterStartsAt?: Date | null;
    encounterExpiresAt?: Date | null;
    versionDelta?: number;
  }) => UpdateRaidRunResult;
  closeRaidRun: (input: {
    runId: string;
    expectedVersion: number;
    status: Extract<RaidRunStatus, "cancelled" | "expired" | "interrupted" | "provision-failed">;
    now: Date;
    publicMessageId?: string | null;
    privateChannelId?: string | null;
    participantRoleId?: string | null;
  }) => CloseRaidRunResult;
  updateRaidRunStoredReferences: (input: {
    runId: string;
    now: Date;
    publicMessageId?: string | null;
    privateChannelId?: string | null;
    participantRoleId?: string | null;
  }) => UpdateRaidRunStoredReferencesResult;
  listRaidRunsByStatuses: (statuses: readonly RaidRunStatus[]) => RaidRunAggregate[];
};

export type PublishRaidRecruitment = (view: ActionView<RaidButtonAction>) => Promise<{
  messageId: string;
  url: string;
  deletePublishedMessage: () => Promise<void>;
}>;

export type PublishRaidStatusMessage = (input: {
  channelId: string;
  view: ActionView<RaidButtonAction>;
}) => Promise<{
  messageId: string;
  deletePublishedMessage: () => Promise<void>;
}>;

export type ProvisionRaidInstanceResult =
  | {
      ok: true;
      privateChannelId: string;
      participantRoleId: string;
    }
  | {
      ok: false;
      reason: string;
      privateChannelId?: string | null;
      participantRoleId?: string | null;
    };

export type RaidInstanceProvisioner = {
  provisionRaidInstance: (input: {
    runId: string;
    publicChannelId: string;
    leaderUserId: string;
    participantUserIds: readonly string[];
    tierName: string;
    bossName: string;
  }) => Promise<ProvisionRaidInstanceResult>;
  cleanupRaidInstance: (input: {
    runId: string;
    privateChannelId: string | null;
    participantRoleId: string | null;
  }) => Promise<void>;
};

export type RaidRecoveryInspector = {
  hasPublicStatusMessage: (input: { channelId: string; messageId: string }) => Promise<boolean>;
  deletePublicStatusMessage: (input: { channelId: string; messageId: string }) => Promise<void>;
  inspectProvisionedRunResources: (input: {
    privateChannelId: string | null;
    participantRoleId: string | null;
    participantUserIds: readonly string[];
  }) => Promise<{
    privateChannelExists: boolean;
    participantRoleExists: boolean;
    participantAssignmentsValid: boolean;
  }>;
  cleanupProvisionedRunResources: (input: {
    privateChannelId: string | null;
    participantRoleId: string | null;
  }) => Promise<void>;
};
