import assert from "node:assert/strict";
import test from "node:test";
import type { ActionView } from "../../../../shared-kernel/application/action-view";
import type { RaidButtonAction } from "../manage-lobby/actions";
import { createRecoverRaidRunsUseCase } from "./use-case";
import type {
  PublishRaidStatusMessage,
  RaidCatalogReader,
  RaidRecoveryInspector,
  RaidRunRepository,
} from "../ports";
import type { RaidRunAggregate, RaidRunMemberRecord, RaidRunRecord } from "../../domain/raid-run";

const buildCatalogReader = (): RaidCatalogReader => ({
  listRaidTiers: () => [],
  getRaidTier: () => null,
  getRaidBoss: () => null,
  getRaidCopy: () => ({
    panelTitle: "Rolly Raids",
    panelDescription: "Pick a tier, recruit a party, and challenge a static raid boss.",
    startRaidButtonLabel: "Start Raid",
    joinRaidButtonLabel: "Join Raid",
    leaveRaidButtonLabel: "Leave Raid",
    startEncounterButtonLabel: "Start Encounter",
    cancelRaidButtonLabel: "Cancel Raid",
  }),
});

const cloneRun = (run: RaidRunRecord): RaidRunRecord => ({
  ...run,
  recruitmentExpiresAt: new Date(run.recruitmentExpiresAt.getTime()),
  encounterStartsAt: run.encounterStartsAt ? new Date(run.encounterStartsAt.getTime()) : null,
  encounterExpiresAt: run.encounterExpiresAt ? new Date(run.encounterExpiresAt.getTime()) : null,
  closeScheduledAt: run.closeScheduledAt ? new Date(run.closeScheduledAt.getTime()) : null,
  createdAt: new Date(run.createdAt.getTime()),
  updatedAt: new Date(run.updatedAt.getTime()),
});

const cloneMember = (member: RaidRunMemberRecord): RaidRunMemberRecord => ({
  ...member,
  joinedAt: new Date(member.joinedAt.getTime()),
  updatedAt: new Date(member.updatedAt.getTime()),
});

const createRecoveryRepository = (runs: RaidRunAggregate[]): RaidRunRepository => {
  const store = new Map(
    runs.map((raidRun) => [
      raidRun.run.runId,
      { run: cloneRun(raidRun.run), members: raidRun.members.map(cloneMember) },
    ]),
  );

  const cloneAggregate = (aggregate: RaidRunAggregate): RaidRunAggregate => ({
    run: cloneRun(aggregate.run),
    members: aggregate.members.map(cloneMember),
  });

  return {
    getRaidRun: (runId) => {
      const raidRun = store.get(runId);
      return raidRun ? cloneAggregate(raidRun) : null;
    },
    getOpenRaidRunForUser: () => null,
    getOpenRaidRunByPrivateChannelId: () => null,
    createRecruitingRaidRun: () => {
      throw new Error("not used");
    },
    addRaidRunMember: () => {
      throw new Error("not used");
    },
    removeRaidRunMember: () => {
      throw new Error("not used");
    },
    updateRaidRun: ({ runId, expectedVersion, now, publicMessageId, versionDelta = 0 }) => {
      const current = store.get(runId);
      if (!current) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (current.run.version !== expectedVersion) {
        return { ok: false as const, reason: "stale" as const };
      }
      current.run.publicMessageId = publicMessageId ?? current.run.publicMessageId;
      current.run.version += versionDelta;
      current.run.updatedAt = new Date(now.getTime());
      store.set(runId, cloneAggregate(current));
      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    closeRaidRun: ({
      runId,
      expectedVersion,
      status,
      now,
      encounterMessageId,
      bossCurrentHp,
      closeScheduledAt,
    }) => {
      const current = store.get(runId);
      if (!current) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (current.run.version !== expectedVersion) {
        return { ok: false as const, reason: "stale" as const };
      }
      current.run.status = status;
      current.run.isOpen = false;
      current.run.encounterMessageId =
        encounterMessageId !== undefined ? encounterMessageId : current.run.encounterMessageId;
      current.run.bossCurrentHp =
        bossCurrentHp !== undefined ? bossCurrentHp : current.run.bossCurrentHp;
      current.run.closeScheduledAt =
        closeScheduledAt !== undefined ? closeScheduledAt : current.run.closeScheduledAt;
      current.run.updatedAt = new Date(now.getTime());
      current.members = current.members.map((member) => ({
        ...member,
        active: false,
        updatedAt: new Date(now.getTime()),
      }));
      store.set(runId, cloneAggregate(current));
      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    updateRaidRunStoredReferences: ({
      runId,
      now,
      publicMessageId,
      privateChannelId,
      participantRoleId,
      encounterMessageId,
      closeScheduledAt,
      closeOpenRunAsInterrupted,
    }) => {
      const current = store.get(runId);
      if (!current) {
        return { ok: false as const, reason: "not-found" as const };
      }

      if (publicMessageId !== undefined) {
        current.run.publicMessageId = publicMessageId;
      }
      if (privateChannelId !== undefined) {
        current.run.privateChannelId = privateChannelId;
      }
      if (participantRoleId !== undefined) {
        current.run.participantRoleId = participantRoleId;
      }
      if (encounterMessageId !== undefined) {
        current.run.encounterMessageId = encounterMessageId;
      }
      if (closeScheduledAt !== undefined) {
        current.run.closeScheduledAt = closeScheduledAt;
      }
      if (closeOpenRunAsInterrupted && current.run.isOpen) {
        current.run.status = "interrupted";
        current.run.isOpen = false;
        current.members = current.members.map((member) => ({
          ...member,
          active: false,
          updatedAt: new Date(now.getTime()),
        }));
      }
      current.run.version += 1;
      current.run.updatedAt = new Date(now.getTime());
      store.set(runId, cloneAggregate(current));
      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    listRaidRunsByStatuses: (statuses) => {
      const wanted = new Set(statuses);
      return [...store.values()]
        .filter((raidRun) => wanted.has(raidRun.run.status))
        .map(cloneAggregate);
    },
  };
};

const createRaidRun = ({
  runId,
  status,
  recruitmentExpiresAt,
  publicMessageId,
  privateChannelId = null,
  participantRoleId = null,
  encounterMessageId = null,
  bossCurrentHp = null,
  closeScheduledAt = null,
}: {
  runId: string;
  status: RaidRunRecord["status"];
  recruitmentExpiresAt: Date;
  publicMessageId: string | null;
  privateChannelId?: string | null;
  participantRoleId?: string | null;
  encounterMessageId?: string | null;
  bossCurrentHp?: number | null;
  closeScheduledAt?: Date | null;
}): RaidRunAggregate => ({
  run: {
    runId,
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    status,
    isOpen:
      status === "recruiting" ||
      status === "provisioning" ||
      status === "provisioned" ||
      status === "active",
    publicChannelId: "channel-1",
    publicMessageId,
    privateChannelId,
    participantRoleId,
    encounterMessageId,
    recruitmentExpiresAt,
    encounterStartsAt: null,
    encounterExpiresAt: null,
    bossCurrentHp,
    closeScheduledAt,
    version: 1,
    createdAt: new Date("2026-03-29T09:00:00.000Z"),
    updatedAt: new Date("2026-03-29T09:00:00.000Z"),
  },
  members: [
    {
      runId,
      userId: "leader-1",
      isLeader: true,
      active: true,
      joinedAt: new Date("2026-03-29T09:00:00.000Z"),
      updatedAt: new Date("2026-03-29T09:00:00.000Z"),
    },
  ],
});

test("recovery republishes missing public recruitment messages for valid recruiting runs", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "recruiting",
      recruitmentExpiresAt: new Date("2026-03-29T10:30:00.000Z"),
      publicMessageId: "message-1",
    }),
  ]);

  let publishedCount = 0;
  const publishStatusMessage: PublishRaidStatusMessage = async () => {
    publishedCount += 1;
    return {
      messageId: "message-2",
      deletePublishedMessage: async () => {
        throw new Error("not used");
      },
    };
  };

  const inspector: RaidRecoveryInspector = {
    hasPublicStatusMessage: async () => false,
    deletePublicStatusMessage: async () => {
      throw new Error("not used");
    },
    inspectProvisionedRunResources: async () => ({
      privateChannelExists: true,
      participantRoleExists: true,
      participantAssignmentsValid: true,
    }),
    cleanupProvisionedRunResources: async () => {
      throw new Error("not used");
    },
  };

  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector,
    publishStatusMessage,
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [] satisfies ActionView<RaidButtonAction>["components"],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(summary.republishedCount, 1);
  assert.equal(summary.resumedCount, 1);
  assert.equal(publishedCount, 1);
  const recovered = repository.getRaidRun("raid-run-1");
  assert.equal(recovered?.run.publicMessageId, "message-2");
  assert.equal(recovered?.run.version, 1);
});

test("recovery republishes recruiting runs that never attached a public message id", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "recruiting",
      recruitmentExpiresAt: new Date("2026-03-29T10:30:00.000Z"),
      publicMessageId: null,
    }),
  ]);

  let inspectedMessage = false;
  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => {
        inspectedMessage = true;
        return true;
      },
      deletePublicStatusMessage: async () => {
        throw new Error("not used");
      },
      inspectProvisionedRunResources: async () => ({
        privateChannelExists: true,
        participantRoleExists: true,
        participantAssignmentsValid: true,
      }),
      cleanupProvisionedRunResources: async () => {
        throw new Error("not used");
      },
    },
    publishStatusMessage: async () => ({
      messageId: "message-2",
      deletePublishedMessage: async () => {
        throw new Error("not used");
      },
    }),
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(summary.republishedCount, 1);
  assert.equal(summary.resumedCount, 1);
  assert.equal(inspectedMessage, false);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.publicMessageId, "message-2");
});

test("recovery expires recruiting runs past their timeout and interrupts broken provisioned runs", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "recruiting",
      recruitmentExpiresAt: new Date("2026-03-29T09:30:00.000Z"),
      publicMessageId: "message-1",
    }),
    createRaidRun({
      runId: "raid-run-2",
      status: "provisioned",
      recruitmentExpiresAt: new Date("2026-03-29T11:30:00.000Z"),
      publicMessageId: "message-2",
      privateChannelId: "private-channel-1",
      participantRoleId: "role-1",
    }),
  ]);

  let updatedExpiredMessage: { channelId: string; messageId: string; content: string } | null =
    null;

  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => true,
      deletePublicStatusMessage: async () => {
        throw new Error("not used");
      },
      inspectProvisionedRunResources: async () => ({
        privateChannelExists: false,
        participantRoleExists: true,
        participantAssignmentsValid: true,
      }),
      cleanupProvisionedRunResources: async () => {
        throw new Error("not used");
      },
    },
    publishStatusMessage: async () => {
      throw new Error("not used");
    },
    updateStatusMessage: async ({ channelId, messageId, view }) => {
      updatedExpiredMessage = {
        channelId,
        messageId,
        content: view.content,
      };
    },
    buildRecruitmentView: (raidRun) => ({
      content: `Status: ${raidRun.run.status}`,
      components: [],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(summary.expiredCount, 1);
  assert.equal(summary.interruptedCount, 1);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.status, "expired");
  assert.equal(repository.getRaidRun("raid-run-2")?.run.status, "interrupted");
  assert.deepEqual(updatedExpiredMessage, {
    channelId: "channel-1",
    messageId: "message-1",
    content: "Status: expired",
  });
});

test("recovery preserves public status messages for expired runs", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "expired",
      recruitmentExpiresAt: new Date("2026-03-29T09:30:00.000Z"),
      publicMessageId: "message-1",
    }),
  ]);

  let deletedPublicMessage = false;
  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => true,
      deletePublicStatusMessage: async () => {
        deletedPublicMessage = true;
      },
      inspectProvisionedRunResources: async () => ({
        privateChannelExists: true,
        participantRoleExists: true,
        participantAssignmentsValid: true,
      }),
      cleanupProvisionedRunResources: async () => {
        throw new Error("not used");
      },
    },
    publishStatusMessage: async () => {
      throw new Error("not used");
    },
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(summary.resumedCount, 1);
  assert.equal(deletedPublicMessage, false);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.publicMessageId, "message-1");
});

test("recovery inspects active runs for missing provisioned resources", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "active",
      recruitmentExpiresAt: new Date("2026-03-29T11:30:00.000Z"),
      publicMessageId: "message-1",
      privateChannelId: "private-channel-1",
      participantRoleId: "role-1",
    }),
  ]);

  let inspectedProvisionedResources = false;
  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => true,
      deletePublicStatusMessage: async () => {
        throw new Error("not used");
      },
      inspectProvisionedRunResources: async () => {
        inspectedProvisionedResources = true;
        return {
          privateChannelExists: true,
          participantRoleExists: false,
          participantAssignmentsValid: true,
        };
      },
      cleanupProvisionedRunResources: async () => {
        throw new Error("not used");
      },
    },
    publishStatusMessage: async () => {
      throw new Error("not used");
    },
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(inspectedProvisionedResources, true);
  assert.equal(summary.interruptedCount, 1);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.status, "interrupted");
});

test("recovery cleans up leaked resources from closed interrupted runs", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "interrupted",
      recruitmentExpiresAt: new Date("2026-03-29T11:30:00.000Z"),
      publicMessageId: null,
      privateChannelId: "private-channel-1",
      participantRoleId: "role-1",
    }),
  ]);

  let cleanedUpResources = false;
  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => {
        throw new Error("not used");
      },
      deletePublicStatusMessage: async () => {
        throw new Error("not used");
      },
      inspectProvisionedRunResources: async () => ({
        privateChannelExists: true,
        participantRoleExists: true,
        participantAssignmentsValid: true,
      }),
      cleanupProvisionedRunResources: async () => {
        cleanedUpResources = true;
      },
    },
    publishStatusMessage: async () => {
      throw new Error("not used");
    },
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(summary.republishedCount, 0);
  assert.equal(summary.resumedCount, 0);
  assert.equal(cleanedUpResources, true);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.privateChannelId, null);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.participantRoleId, null);
});

test("recovery deletes a republished recruitment message if attachment fails", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "recruiting",
      recruitmentExpiresAt: new Date("2026-03-29T10:30:00.000Z"),
      publicMessageId: "message-1",
    }),
  ]);

  const defaultUpdateRaidRun = repository.updateRaidRun.bind(repository);
  repository.updateRaidRun = (input) => {
    if (input.runId === "raid-run-1" && input.publicMessageId === "message-2") {
      return { ok: false as const, reason: "stale" as const };
    }

    return defaultUpdateRaidRun(input);
  };

  let deletedRepublishedMessage = false;
  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => false,
      deletePublicStatusMessage: async () => {
        throw new Error("not used");
      },
      inspectProvisionedRunResources: async () => ({
        privateChannelExists: true,
        participantRoleExists: true,
        participantAssignmentsValid: true,
      }),
      cleanupProvisionedRunResources: async () => {
        throw new Error("not used");
      },
    },
    publishStatusMessage: async () => ({
      messageId: "message-2",
      deletePublishedMessage: async () => {
        deletedRepublishedMessage = true;
      },
    }),
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(summary.republishedCount, 0);
  assert.equal(summary.resumedCount, 0);
  assert.equal(deletedRepublishedMessage, true);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.publicMessageId, "message-1");
});

test("recovery interrupts an open run if republish attach and delete both fail", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "recruiting",
      recruitmentExpiresAt: new Date("2026-03-29T10:30:00.000Z"),
      publicMessageId: "message-1",
    }),
  ]);

  const defaultUpdateRaidRun = repository.updateRaidRun.bind(repository);
  repository.updateRaidRun = (input) => {
    if (input.runId === "raid-run-1" && input.publicMessageId === "message-2") {
      return { ok: false as const, reason: "stale" as const };
    }

    return defaultUpdateRaidRun(input);
  };

  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => false,
      deletePublicStatusMessage: async () => {
        throw new Error("not used");
      },
      inspectProvisionedRunResources: async () => ({
        privateChannelExists: true,
        participantRoleExists: true,
        participantAssignmentsValid: true,
      }),
      cleanupProvisionedRunResources: async () => {
        throw new Error("not used");
      },
    },
    publishStatusMessage: async () => ({
      messageId: "message-2",
      deletePublishedMessage: async () => {
        throw new Error("delete failed");
      },
    }),
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(summary.republishedCount, 0);
  assert.equal(summary.resumedCount, 0);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.status, "interrupted");
  assert.equal(repository.getRaidRun("raid-run-1")?.run.isOpen, false);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.publicMessageId, "message-2");
});

test("recovery continues past closed-run cleanup failures", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "interrupted",
      recruitmentExpiresAt: new Date("2026-03-29T11:30:00.000Z"),
      publicMessageId: null,
      privateChannelId: "private-channel-1",
      participantRoleId: "role-1",
    }),
    createRaidRun({
      runId: "raid-run-2",
      status: "recruiting",
      recruitmentExpiresAt: new Date("2026-03-29T10:30:00.000Z"),
      publicMessageId: "message-2",
    }),
  ]);

  let cleanupCalls = 0;
  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => true,
      deletePublicStatusMessage: async () => {
        throw new Error("not used");
      },
      inspectProvisionedRunResources: async () => ({
        privateChannelExists: true,
        participantRoleExists: true,
        participantAssignmentsValid: true,
      }),
      cleanupProvisionedRunResources: async () => {
        cleanupCalls += 1;
        throw new Error("cleanup failed");
      },
    },
    publishStatusMessage: async () => {
      throw new Error("not used");
    },
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [],
    }),
  });

  const summary = await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(cleanupCalls, 1);
  assert.equal(summary.resumedCount, 1);
});

test("recovery deletes persisted public messages for interrupted runs", async () => {
  const repository = createRecoveryRepository([
    createRaidRun({
      runId: "raid-run-1",
      status: "interrupted",
      recruitmentExpiresAt: new Date("2026-03-29T11:30:00.000Z"),
      publicMessageId: "message-1",
    }),
  ]);

  let deletedPublicMessage = false;
  const useCase = createRecoverRaidRunsUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    inspector: {
      hasPublicStatusMessage: async () => {
        throw new Error("not used");
      },
      deletePublicStatusMessage: async () => {
        deletedPublicMessage = true;
      },
      inspectProvisionedRunResources: async () => ({
        privateChannelExists: true,
        participantRoleExists: true,
        participantAssignmentsValid: true,
      }),
      cleanupProvisionedRunResources: async () => {
        throw new Error("not used");
      },
    },
    publishStatusMessage: async () => {
      throw new Error("not used");
    },
    buildRecruitmentView: () => ({
      content: "Recruitment",
      components: [],
    }),
  });

  await useCase({
    now: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(deletedPublicMessage, true);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.publicMessageId, null);
});
