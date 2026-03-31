import assert from "node:assert/strict";
import test from "node:test";
import { createExpireRecruitingRaidRunsUseCase } from "./use-case";
import type { RaidRunAggregate, RaidRunMemberRecord, RaidRunRecord } from "../../domain/raid-run";
import type { RaidRunRepository } from "../ports";

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

const createRepository = (runs: RaidRunAggregate[]): RaidRunRepository => {
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
    updateRaidRun: () => {
      throw new Error("not used");
    },
    closeRaidRun: ({ runId, expectedVersion, status, now }) => {
      const current = store.get(runId);
      if (!current) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (current.run.version !== expectedVersion) {
        return { ok: false as const, reason: "stale" as const };
      }

      current.run.status = status;
      current.run.isOpen = false;
      current.run.updatedAt = new Date(now.getTime());
      current.members = current.members.map((member) => ({
        ...member,
        active: false,
        updatedAt: new Date(now.getTime()),
      }));
      store.set(runId, cloneAggregate(current));

      return { ok: true as const, raidRun: cloneAggregate(current) };
    },
    updateRaidRunStoredReferences: () => {
      throw new Error("not used");
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
  recruitmentExpiresAt,
  publicMessageId,
}: {
  runId: string;
  recruitmentExpiresAt: Date;
  publicMessageId: string | null;
}): RaidRunAggregate => ({
  run: {
    runId,
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    status: "recruiting",
    isOpen: true,
    publicChannelId: "channel-1",
    publicMessageId,
    privateChannelId: null,
    participantRoleId: null,
    encounterMessageId: null,
    recruitmentExpiresAt,
    encounterStartsAt: null,
    encounterExpiresAt: null,
    bossCurrentHp: null,
    closeScheduledAt: null,
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

test("expiry use case closes overdue recruiting runs and updates the public message", async () => {
  const repository = createRepository([
    createRaidRun({
      runId: "raid-run-1",
      recruitmentExpiresAt: new Date("2026-03-29T09:30:00.000Z"),
      publicMessageId: "message-1",
    }),
  ]);

  let updatedMessage: { channelId: string; messageId: string; content: string } | null = null;

  const useCase = createExpireRecruitingRaidRunsUseCase({
    repository,
    updateStatusMessage: async ({ channelId, messageId, view }) => {
      updatedMessage = {
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
  assert.equal(summary.updatedMessageCount, 1);
  assert.equal(summary.updateFailureCount, 0);
  assert.deepEqual(updatedMessage, {
    channelId: "channel-1",
    messageId: "message-1",
    content: "Status: expired",
  });
  assert.equal(repository.getRaidRun("raid-run-1")?.run.status, "expired");
});
