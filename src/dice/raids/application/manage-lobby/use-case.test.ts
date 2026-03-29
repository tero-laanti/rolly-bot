import assert from "node:assert/strict";
import test from "node:test";
import type { ActionView } from "../../../../shared-kernel/application/action-view";
import type { RaidButtonAction } from "./actions";
import { buildRaidRecruitmentView, createManageRaidLobbyUseCase } from "./use-case";
import type {
  CreateRecruitingRaidRunInput,
  PublishRaidRecruitment,
  RaidCatalogReader,
  RaidInstanceProvisioner,
  RaidRunRepository,
} from "../ports";
import type { RaidRunAggregate } from "../../domain/raid-run";
import { type RaidRunMemberRecord, type RaidRunRecord } from "../../domain/raid-run";
import { raidRecruitmentDurationMs } from "../defaults";

const buildCatalogReader = (): RaidCatalogReader => {
  const tiers = [
    {
      tierId: "bronze",
      name: "Bronze",
      summary: "Entry raid tier.",
      bosses: [
        {
          bossId: "bone-dragon",
          tierId: "bronze",
          name: "Bone Dragon",
          level: 6,
          maxHp: 120,
          reward: {
            pips: 6,
            rollPassMultiplier: 2,
            rollPassRolls: 1,
          },
          copy: {
            recruitmentSummary: "A brittle drake circles the ruined tower.",
            encounterTitle: "Bone Dragon",
            successSummary: "The Bone Dragon collapses into splinters.",
            failureSummary: "The Bone Dragon escapes the tower ruins.",
          },
        },
      ],
    },
  ] as const;

  return {
    listRaidTiers: () => tiers,
    getRaidTier: (tierId) => tiers.find((tier) => tier.tierId === tierId) ?? null,
    getRaidBoss: (bossId) =>
      tiers.flatMap((tier) => tier.bosses).find((boss) => boss.bossId === bossId) ?? null,
    getRaidCopy: () => ({
      panelTitle: "Rolly Raids",
      panelDescription: "Pick a tier, gather a party, and take down a raid boss.",
      startRaidButtonLabel: "Start Raid",
      joinRaidButtonLabel: "Join Raid",
      leaveRaidButtonLabel: "Leave Raid",
      startEncounterButtonLabel: "Start Encounter",
      cancelRaidButtonLabel: "Cancel Raid",
    }),
  };
};

const cloneRun = (run: RaidRunRecord): RaidRunRecord => ({
  ...run,
  recruitmentExpiresAt: new Date(run.recruitmentExpiresAt.getTime()),
  encounterStartsAt: run.encounterStartsAt ? new Date(run.encounterStartsAt.getTime()) : null,
  encounterExpiresAt: run.encounterExpiresAt ? new Date(run.encounterExpiresAt.getTime()) : null,
  createdAt: new Date(run.createdAt.getTime()),
  updatedAt: new Date(run.updatedAt.getTime()),
});

const cloneMember = (member: RaidRunMemberRecord): RaidRunMemberRecord => ({
  ...member,
  joinedAt: new Date(member.joinedAt.getTime()),
  updatedAt: new Date(member.updatedAt.getTime()),
});

const createInMemoryRaidRunRepository = (): RaidRunRepository & {
  runs: Map<string, RaidRunAggregate>;
} => {
  const runs = new Map<string, RaidRunAggregate>();

  const cloneAggregate = (aggregate: RaidRunAggregate): RaidRunAggregate => ({
    run: cloneRun(aggregate.run),
    members: aggregate.members.map(cloneMember),
  });

  const getOpenRunForUser = (userId: string) => {
    for (const raidRun of runs.values()) {
      if (
        raidRun.run.isOpen &&
        raidRun.members.some((member) => member.active && member.userId === userId)
      ) {
        return cloneAggregate(raidRun);
      }
    }

    return null;
  };

  return {
    runs,
    getRaidRun: (runId) => {
      const raidRun = runs.get(runId);
      return raidRun ? cloneAggregate(raidRun) : null;
    },
    getOpenRaidRunForUser: (userId) => getOpenRunForUser(userId),
    createRecruitingRaidRun: (input: CreateRecruitingRaidRunInput) => {
      if (getOpenRunForUser(input.leaderUserId)) {
        return { ok: false as const, reason: "user-active-run" as const };
      }

      const raidRun: RaidRunAggregate = {
        run: {
          runId: input.runId,
          tierId: input.tierId,
          bossId: input.bossId,
          leaderUserId: input.leaderUserId,
          status: "recruiting",
          isOpen: true,
          publicChannelId: input.publicChannelId,
          publicMessageId: null,
          privateChannelId: null,
          participantRoleId: null,
          recruitmentExpiresAt: new Date(input.recruitmentExpiresAt.getTime()),
          encounterStartsAt: null,
          encounterExpiresAt: null,
          version: 1,
          createdAt: new Date(input.now.getTime()),
          updatedAt: new Date(input.now.getTime()),
        },
        members: [
          {
            runId: input.runId,
            userId: input.leaderUserId,
            isLeader: true,
            active: true,
            joinedAt: new Date(input.now.getTime()),
            updatedAt: new Date(input.now.getTime()),
          },
        ],
      };
      runs.set(input.runId, cloneAggregate(raidRun));
      return { ok: true as const, raidRun: cloneAggregate(raidRun) };
    },
    addRaidRunMember: ({ runId, userId, expectedVersion, now, partySizeLimit }) => {
      const current = runs.get(runId);
      if (!current) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (current.run.version !== expectedVersion) {
        return { ok: false as const, reason: "stale" as const };
      }
      if (current.run.status !== "recruiting" || !current.run.isOpen) {
        return { ok: false as const, reason: "not-recruiting" as const };
      }
      if (current.members.some((member) => member.active && member.userId === userId)) {
        return { ok: false as const, reason: "already-member" as const };
      }
      if (getOpenRunForUser(userId)) {
        return { ok: false as const, reason: "user-active-run" as const };
      }
      if (current.members.filter((member) => member.active).length >= partySizeLimit) {
        return { ok: false as const, reason: "party-full" as const };
      }
      const inactiveMember = current.members.find(
        (member) => !member.active && member.userId === userId,
      );
      if (inactiveMember) {
        inactiveMember.active = true;
        inactiveMember.joinedAt = new Date(now.getTime());
        inactiveMember.updatedAt = new Date(now.getTime());
      } else {
        current.members = [
          ...current.members,
          {
            runId,
            userId,
            isLeader: false,
            active: true,
            joinedAt: new Date(now.getTime()),
            updatedAt: new Date(now.getTime()),
          },
        ];
      }
      current.run.version += 1;
      current.run.updatedAt = new Date(now.getTime());
      runs.set(runId, cloneAggregate(current));
      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    removeRaidRunMember: ({ runId, userId, expectedVersion, now }) => {
      const current = runs.get(runId);
      if (!current) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (current.run.version !== expectedVersion) {
        return { ok: false as const, reason: "stale" as const };
      }
      if (current.run.status !== "recruiting" || !current.run.isOpen) {
        return { ok: false as const, reason: "not-recruiting" as const };
      }
      const member = current.members.find((entry) => entry.active && entry.userId === userId);
      if (!member) {
        return { ok: false as const, reason: "not-member" as const };
      }
      if (member.isLeader) {
        return { ok: false as const, reason: "leader-cannot-leave" as const };
      }

      member.active = false;
      member.updatedAt = new Date(now.getTime());
      current.run.version += 1;
      current.run.updatedAt = new Date(now.getTime());
      runs.set(runId, cloneAggregate(current));
      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    updateRaidRun: ({
      runId,
      expectedVersion,
      now,
      status,
      isOpen,
      publicMessageId,
      privateChannelId,
      participantRoleId,
      encounterStartsAt,
      encounterExpiresAt,
      versionDelta = 0,
    }) => {
      const current = runs.get(runId);
      if (!current) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (current.run.version !== expectedVersion) {
        return { ok: false as const, reason: "stale" as const };
      }
      if (!current.run.isOpen && isOpen !== true) {
        return { ok: false as const, reason: "not-open" as const };
      }

      current.run.status = status ?? current.run.status;
      current.run.isOpen = isOpen ?? current.run.isOpen;
      if (publicMessageId !== undefined) {
        current.run.publicMessageId = publicMessageId;
      }
      if (privateChannelId !== undefined) {
        current.run.privateChannelId = privateChannelId;
      }
      if (participantRoleId !== undefined) {
        current.run.participantRoleId = participantRoleId;
      }
      if (encounterStartsAt !== undefined) {
        current.run.encounterStartsAt = encounterStartsAt;
      }
      if (encounterExpiresAt !== undefined) {
        current.run.encounterExpiresAt = encounterExpiresAt;
      }
      current.run.version += versionDelta;
      current.run.updatedAt = new Date(now.getTime());
      runs.set(runId, cloneAggregate(current));
      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    closeRaidRun: ({
      runId,
      expectedVersion,
      status,
      now,
      publicMessageId,
      privateChannelId,
      participantRoleId,
    }) => {
      const current = runs.get(runId);
      if (!current) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (current.run.version !== expectedVersion) {
        return { ok: false as const, reason: "stale" as const };
      }

      current.run.status = status;
      current.run.isOpen = false;
      current.run.publicMessageId =
        publicMessageId !== undefined ? publicMessageId : current.run.publicMessageId;
      current.run.privateChannelId =
        privateChannelId !== undefined ? privateChannelId : current.run.privateChannelId;
      current.run.participantRoleId =
        participantRoleId !== undefined ? participantRoleId : current.run.participantRoleId;
      current.run.updatedAt = new Date(now.getTime());
      current.members = current.members.map((member) => ({
        ...member,
        active: false,
        updatedAt: new Date(now.getTime()),
      }));
      runs.set(runId, cloneAggregate(current));
      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    updateRaidRunStoredReferences: ({
      runId,
      now,
      publicMessageId,
      privateChannelId,
      participantRoleId,
      closeOpenRunAsInterrupted,
    }) => {
      const current = runs.get(runId);
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
      runs.set(runId, cloneAggregate(current));
      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    listRaidRunsByStatuses: (statuses) => {
      const wanted = new Set(statuses);
      return [...runs.values()]
        .filter((raidRun) => wanted.has(raidRun.run.status))
        .map(cloneAggregate);
    },
  };
};

test("panel-open-boss-chooser replies with the tier boss picker", async () => {
  const useCase = createManageRaidLobbyUseCase({
    catalogReader: buildCatalogReader(),
    repository: createInMemoryRaidRunRepository(),
    provisioner: {
      provisionRaidInstance: async () => {
        throw new Error("not used");
      },
      cleanupRaidInstance: async () => {
        throw new Error("not used");
      },
    },
  });

  const result = await useCase.handleRaidAction({
    actorId: "user-1",
    action: {
      kind: "panel-open-boss-chooser",
      tierId: "bronze",
    },
    channelId: "channel-1",
  });

  assert.equal(result.kind, "reply");
  assert.equal(result.payload.type, "view");
  assert.match(result.payload.view.content, /Pick the boss/);
});

test("choose-boss publishes recruitment and persists the run", async () => {
  const repository = createInMemoryRaidRunRepository();
  let publishedView: ActionView<RaidButtonAction> | null = null;
  const publishRecruitment: PublishRaidRecruitment = async (view) => {
    publishedView = view;
    return {
      messageId: "message-1",
      url: "https://example.test/recruitment/1",
      deletePublishedMessage: async () => {
        throw new Error("not used");
      },
    };
  };

  const useCase = createManageRaidLobbyUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    provisioner: {
      provisionRaidInstance: async () => {
        throw new Error("not used");
      },
      cleanupRaidInstance: async () => {
        throw new Error("not used");
      },
    },
    randomId: () => "raid-run-1",
  });

  const now = new Date("2026-03-29T10:00:00.000Z");
  const result = await useCase.handleRaidAction({
    actorId: "user-1",
    action: {
      kind: "choose-boss",
      tierId: "bronze",
      bossId: "bone-dragon",
    },
    channelId: "channel-1",
    now,
    publishRecruitment,
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /Raid recruitment posted/);
  assert.ok(publishedView);

  const raidRun = repository.getRaidRun("raid-run-1");
  assert.ok(raidRun);
  assert.equal(raidRun.run.publicMessageId, "message-1");
  assert.equal(raidRun.run.status, "recruiting");
  assert.equal(
    raidRun.run.recruitmentExpiresAt.getTime(),
    now.getTime() + raidRecruitmentDurationMs,
  );
});

test("choose-boss deletes the published message and cancels the run when attachment fails", async () => {
  const repository = createInMemoryRaidRunRepository();
  let deletedPublishedMessage = false;
  const useCase = createManageRaidLobbyUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    provisioner: {
      provisionRaidInstance: async () => {
        throw new Error("not used");
      },
      cleanupRaidInstance: async () => {
        throw new Error("not used");
      },
    },
    randomId: () => "raid-run-1",
  });

  const staleVersion = repository.updateRaidRun.bind(repository);
  repository.updateRaidRun = (input) => {
    if (input.runId === "raid-run-1" && input.publicMessageId === "message-1") {
      return { ok: false as const, reason: "stale" as const };
    }

    return staleVersion(input);
  };

  const result = await useCase.handleRaidAction({
    actorId: "user-1",
    action: {
      kind: "choose-boss",
      tierId: "bronze",
      bossId: "bone-dragon",
    },
    channelId: "channel-1",
    now: new Date("2026-03-29T10:00:00.000Z"),
    publishRecruitment: async () => ({
      messageId: "message-1",
      url: "https://example.test/recruitment/1",
      deletePublishedMessage: async () => {
        deletedPublishedMessage = true;
      },
    }),
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /cancelled before players could join/i);
  assert.equal(deletedPublishedMessage, true);

  const raidRun = repository.getRaidRun("raid-run-1");
  assert.ok(raidRun);
  assert.equal(raidRun.run.status, "cancelled");
  assert.equal(raidRun.run.publicMessageId, null);
});

test("choose-boss interrupts an open run when message deletion also fails", async () => {
  const repository = createInMemoryRaidRunRepository();
  const useCase = createManageRaidLobbyUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    provisioner: {
      provisionRaidInstance: async () => {
        throw new Error("not used");
      },
      cleanupRaidInstance: async () => {
        throw new Error("not used");
      },
    },
    randomId: () => "raid-run-1",
  });

  const staleVersion = repository.updateRaidRun.bind(repository);
  repository.updateRaidRun = (input) => {
    if (input.runId === "raid-run-1" && input.publicMessageId === "message-1") {
      return { ok: false as const, reason: "stale" as const };
    }

    return staleVersion(input);
  };

  const result = await useCase.handleRaidAction({
    actorId: "user-1",
    action: {
      kind: "choose-boss",
      tierId: "bronze",
      bossId: "bone-dragon",
    },
    channelId: "channel-1",
    now: new Date("2026-03-29T10:00:00.000Z"),
    publishRecruitment: async () => ({
      messageId: "message-1",
      url: "https://example.test/recruitment/1",
      deletePublishedMessage: async () => {
        throw new Error("delete failed");
      },
    }),
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /operator cleanup/i);

  const raidRun = repository.getRaidRun("raid-run-1");
  assert.ok(raidRun);
  assert.equal(raidRun.run.status, "interrupted");
  assert.equal(raidRun.run.isOpen, false);
  assert.equal(raidRun.run.publicMessageId, "message-1");
});

test("join-run updates the recruitment view and rejects stale versions", async () => {
  const repository = createInMemoryRaidRunRepository();
  const useCase = createManageRaidLobbyUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    provisioner: {
      provisionRaidInstance: async () => {
        throw new Error("not used");
      },
      cleanupRaidInstance: async () => {
        throw new Error("not used");
      },
    },
    randomId: () => "raid-run-1",
  });

  await useCase.handleRaidAction({
    actorId: "leader-1",
    action: {
      kind: "choose-boss",
      tierId: "bronze",
      bossId: "bone-dragon",
    },
    channelId: "channel-1",
    publishRecruitment: async () => ({
      messageId: "message-1",
      url: "https://example.test/recruitment/1",
      deletePublishedMessage: async () => {
        throw new Error("not used");
      },
    }),
  });

  const joinResult = await useCase.handleRaidAction({
    actorId: "user-2",
    action: {
      kind: "join-run",
      runId: "raid-run-1",
      version: 1,
    },
    channelId: "channel-1",
    messageId: "message-1",
  });

  assert.equal(joinResult.kind, "update");
  assert.equal(joinResult.payload.type, "view");
  assert.match(joinResult.payload.view.content, /<@user-2>/);

  const staleResult = await useCase.handleRaidAction({
    actorId: "user-3",
    action: {
      kind: "join-run",
      runId: "raid-run-1",
      version: 1,
    },
    channelId: "channel-1",
    messageId: "message-1",
  });

  assert.equal(staleResult.kind, "reply");
  assert.equal(staleResult.payload.type, "message");
  assert.match(staleResult.payload.content, /stale/i);
});

test("recruitment view labels leader controls and disables start until the party reaches two players", async () => {
  const repository = createInMemoryRaidRunRepository();
  const catalogReader = buildCatalogReader();
  const useCase = createManageRaidLobbyUseCase({
    catalogReader,
    repository,
    provisioner: {
      provisionRaidInstance: async () => ({
        ok: false,
        reason: "not used",
      }),
      cleanupRaidInstance: async () => {},
    },
    randomId: () => "raid-run-1",
  });

  await useCase.handleRaidAction({
    actorId: "leader-1",
    action: {
      kind: "choose-boss",
      tierId: "bronze",
      bossId: "bone-dragon",
    },
    channelId: "channel-1",
    publishRecruitment: async () => ({
      messageId: "message-1",
      url: "https://example.test/recruitment/1",
      deletePublishedMessage: async () => {},
    }),
  });

  const recruitingRun = repository.getRaidRun("raid-run-1");
  assert.ok(recruitingRun);

  const initialView = buildRaidRecruitmentView(catalogReader, recruitingRun);
  assert.match(initialView.content, /Need 2-4 players/i);
  assert.equal(initialView.components.length, 2);
  assert.equal(initialView.components[1]?.[0]?.label, "Leader: Start Encounter");
  assert.equal(initialView.components[1]?.[0]?.disabled, true);
  assert.equal(initialView.components[1]?.[1]?.label, "Leader: Cancel Raid");

  await useCase.handleRaidAction({
    actorId: "user-2",
    action: {
      kind: "join-run",
      runId: "raid-run-1",
      version: 1,
    },
    channelId: "channel-1",
    messageId: "message-1",
  });

  const readyRun = repository.getRaidRun("raid-run-1");
  assert.ok(readyRun);

  const readyView = buildRaidRecruitmentView(catalogReader, readyRun);
  assert.equal(readyView.components[1]?.[0]?.disabled, false);
});

test("start-run requires at least two players", async () => {
  const repository = createInMemoryRaidRunRepository();
  const useCase = createManageRaidLobbyUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    provisioner: {
      provisionRaidInstance: async () => ({
        ok: false,
        reason: "not used",
      }),
      cleanupRaidInstance: async () => {},
    },
    randomId: () => "raid-run-1",
  });

  await useCase.handleRaidAction({
    actorId: "leader-1",
    action: {
      kind: "choose-boss",
      tierId: "bronze",
      bossId: "bone-dragon",
    },
    channelId: "channel-1",
    publishRecruitment: async () => ({
      messageId: "message-1",
      url: "https://example.test/recruitment/1",
      deletePublishedMessage: async () => {
        throw new Error("not used");
      },
    }),
  });

  const result = await useCase.handleRaidAction({
    actorId: "leader-1",
    action: {
      kind: "start-run",
      runId: "raid-run-1",
      version: 1,
    },
    channelId: "channel-1",
    messageId: "message-1",
    now: new Date("2026-03-29T10:05:00.000Z"),
  });

  assert.equal(result.kind, "reply");
  assert.equal(result.payload.type, "message");
  assert.match(result.payload.content, /at least 2 players/i);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.status, "recruiting");
});

test("start-run provisions the private instance and locks the public recruitment", async () => {
  const repository = createInMemoryRaidRunRepository();
  const provisioner: RaidInstanceProvisioner = {
    provisionRaidInstance: async () => ({
      ok: true,
      privateChannelId: "private-channel-1",
      participantRoleId: "role-1",
    }),
    cleanupRaidInstance: async () => {
      throw new Error("not used");
    },
  };

  const useCase = createManageRaidLobbyUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    provisioner,
    randomId: () => "raid-run-1",
  });

  await useCase.handleRaidAction({
    actorId: "leader-1",
    action: {
      kind: "choose-boss",
      tierId: "bronze",
      bossId: "bone-dragon",
    },
    channelId: "channel-1",
    publishRecruitment: async () => ({
      messageId: "message-1",
      url: "https://example.test/recruitment/1",
      deletePublishedMessage: async () => {
        throw new Error("not used");
      },
    }),
  });

  await useCase.handleRaidAction({
    actorId: "user-2",
    action: {
      kind: "join-run",
      runId: "raid-run-1",
      version: 1,
    },
    channelId: "channel-1",
    messageId: "message-1",
  });

  const raidRun = repository.getRaidRun("raid-run-1");
  assert.ok(raidRun);

  const result = await useCase.handleRaidAction({
    actorId: "leader-1",
    action: {
      kind: "start-run",
      runId: "raid-run-1",
      version: raidRun.run.version,
    },
    channelId: "channel-1",
    messageId: "message-1",
    now: new Date("2026-03-29T10:05:00.000Z"),
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  assert.match(result.payload.view.content, /<#private-channel-1>/i);
  assert.match(result.payload.view.content, /\/roll/i);
  assert.equal(result.payload.view.components.length, 0);

  const updated = repository.getRaidRun("raid-run-1");
  assert.ok(updated);
  assert.equal(updated.run.status, "provisioned");
  assert.equal(updated.run.privateChannelId, "private-channel-1");
  assert.equal(updated.run.participantRoleId, "role-1");
});

test("start-run cleans up provisioned resources if the final run update fails", async () => {
  const repository = createInMemoryRaidRunRepository();
  let cleanedUpRunId: string | null = null;
  const useCase = createManageRaidLobbyUseCase({
    catalogReader: buildCatalogReader(),
    repository,
    provisioner: {
      provisionRaidInstance: async () => ({
        ok: true,
        privateChannelId: "private-channel-1",
        participantRoleId: "role-1",
      }),
      cleanupRaidInstance: async ({ runId }) => {
        cleanedUpRunId = runId;
      },
    },
    randomId: () => "raid-run-1",
  });

  const defaultUpdateRaidRun = repository.updateRaidRun.bind(repository);
  repository.updateRaidRun = (input) => {
    if (input.runId === "raid-run-1" && input.status === "provisioned") {
      return { ok: false as const, reason: "stale" as const };
    }

    return defaultUpdateRaidRun(input);
  };

  await useCase.handleRaidAction({
    actorId: "leader-1",
    action: {
      kind: "choose-boss",
      tierId: "bronze",
      bossId: "bone-dragon",
    },
    channelId: "channel-1",
    publishRecruitment: async () => ({
      messageId: "message-1",
      url: "https://example.test/recruitment/1",
      deletePublishedMessage: async () => {
        throw new Error("not used");
      },
    }),
  });

  await useCase.handleRaidAction({
    actorId: "user-2",
    action: {
      kind: "join-run",
      runId: "raid-run-1",
      version: 1,
    },
    channelId: "channel-1",
    messageId: "message-1",
  });

  const result = await useCase.handleRaidAction({
    actorId: "leader-1",
    action: {
      kind: "start-run",
      runId: "raid-run-1",
      version: 2,
    },
    channelId: "channel-1",
    messageId: "message-1",
    now: new Date("2026-03-29T10:05:00.000Z"),
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  assert.match(result.payload.view.content, /interrupted/i);
  assert.equal(cleanedUpRunId, "raid-run-1");
  assert.equal(repository.getRaidRun("raid-run-1")?.run.status, "interrupted");
  assert.equal(repository.getRaidRun("raid-run-1")?.run.privateChannelId, null);
  assert.equal(repository.getRaidRun("raid-run-1")?.run.participantRoleId, null);
});
