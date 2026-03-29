import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteRaidRunRepository } from "./raid-run-repository";
import { raidEncounterDurationMs, raidRecruitmentDurationMs } from "../../application/defaults";

const createTestDatabase = (): Database.Database => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initializeDatabaseSchema(db);
  return db;
};

const createTestRepository = (): ReturnType<typeof createSqliteRaidRunRepository> => {
  return createSqliteRaidRunRepository(createTestDatabase());
};

test("createRecruitingRaidRun stores the raid run and leader membership", () => {
  const db = createTestDatabase();
  const repository = createSqliteRaidRunRepository(db);
  const now = new Date("2026-03-29T10:00:00.000Z");

  const result = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-1",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected raid run creation to succeed");
  }

  assert.equal(result.raidRun.run.runId, "raid-run-1");
  assert.equal(result.raidRun.run.tierId, "bronze");
  assert.equal(result.raidRun.run.bossId, "bone-dragon");
  assert.equal(result.raidRun.run.leaderUserId, "leader-1");
  assert.equal(result.raidRun.run.status, "recruiting");
  assert.equal(result.raidRun.run.isOpen, true);
  assert.equal(result.raidRun.run.version, 1);
  assert.equal(
    result.raidRun.run.recruitmentExpiresAt.getTime(),
    now.getTime() + raidRecruitmentDurationMs,
  );
  assert.equal(result.raidRun.members.length, 1);
  assert.equal(result.raidRun.members[0]?.userId, "leader-1");
  assert.equal(result.raidRun.members[0]?.isLeader, true);
  assert.equal(result.raidRun.members[0]?.active, true);

  const openRun = repository.getOpenRaidRunForUser("leader-1");
  assert.ok(openRun);
  assert.equal(openRun?.run.runId, "raid-run-1");
  assert.equal(repository.getOpenRaidRunForUser("user-2"), null);
});

test("createRecruitingRaidRun rejects a second active raid for the same user", () => {
  const repository = createTestRepository();
  const now = new Date("2026-03-29T10:00:00.000Z");

  const first = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-1",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });
  assert.equal(first.ok, true);

  const second = repository.createRecruitingRaidRun({
    runId: "raid-run-2",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-2",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });

  assert.equal(second.ok, false);
  if (second.ok) {
    throw new Error("expected the second raid run creation to fail");
  }

  assert.equal(second.reason, "user-active-run");
  assert.equal(repository.getRaidRun("raid-run-2"), null);
});

test("addRaidRunMember enforces optimistic versions, party size, and active membership uniqueness", () => {
  const repository = createTestRepository();
  const now = new Date("2026-03-29T10:00:00.000Z");

  const createRun = (runId: string, leaderUserId: string) => {
    const result = repository.createRecruitingRaidRun({
      runId,
      tierId: "bronze",
      bossId: "bone-dragon",
      leaderUserId,
      publicChannelId: `${runId}-channel`,
      recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
      now,
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(`expected ${runId} to be created`);
    }
  };

  createRun("raid-run-1", "leader-1");
  createRun("raid-run-2", "leader-2");

  const firstAdd = repository.addRaidRunMember({
    runId: "raid-run-1",
    userId: "user-3",
    expectedVersion: 1,
    now,
    partySizeLimit: 4,
  });
  assert.equal(firstAdd.ok, true);
  if (!firstAdd.ok) {
    throw new Error("expected the first member join to succeed");
  }
  assert.equal(firstAdd.raidRun.run.version, 2);
  assert.equal(firstAdd.raidRun.members.filter((member) => member.active).length, 2);

  const staleAdd = repository.addRaidRunMember({
    runId: "raid-run-1",
    userId: "user-4",
    expectedVersion: 1,
    now,
    partySizeLimit: 4,
  });
  assert.equal(staleAdd.ok, false);
  if (staleAdd.ok) {
    throw new Error("expected the stale join to fail");
  }
  assert.equal(staleAdd.reason, "stale");

  const conflictingAdd = repository.addRaidRunMember({
    runId: "raid-run-2",
    userId: "user-3",
    expectedVersion: 1,
    now,
    partySizeLimit: 4,
  });
  assert.equal(conflictingAdd.ok, false);
  if (conflictingAdd.ok) {
    throw new Error("expected the conflicting join to fail");
  }
  assert.equal(conflictingAdd.reason, "user-active-run");

  const fullAdd = repository.addRaidRunMember({
    runId: "raid-run-1",
    userId: "user-4",
    expectedVersion: 2,
    now,
    partySizeLimit: 2,
  });
  assert.equal(fullAdd.ok, false);
  if (fullAdd.ok) {
    throw new Error("expected the full party join to fail");
  }
  assert.equal(fullAdd.reason, "party-full");
});

test("removeRaidRunMember rejects the leader and deactivates departing members", () => {
  const repository = createTestRepository();
  const now = new Date("2026-03-29T10:00:00.000Z");

  const created = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-1",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });
  assert.equal(created.ok, true);

  const joined = repository.addRaidRunMember({
    runId: "raid-run-1",
    userId: "user-2",
    expectedVersion: 1,
    now,
    partySizeLimit: 4,
  });
  assert.equal(joined.ok, true);
  if (!joined.ok) {
    throw new Error("expected member join to succeed");
  }

  const leaderLeave = repository.removeRaidRunMember({
    runId: "raid-run-1",
    userId: "leader-1",
    expectedVersion: 2,
    now,
  });
  assert.equal(leaderLeave.ok, false);
  if (leaderLeave.ok) {
    throw new Error("expected the leader leave to fail");
  }
  assert.equal(leaderLeave.reason, "leader-cannot-leave");

  const memberLeave = repository.removeRaidRunMember({
    runId: "raid-run-1",
    userId: "user-2",
    expectedVersion: 2,
    now,
  });
  assert.equal(memberLeave.ok, true);
  if (!memberLeave.ok) {
    throw new Error("expected the member leave to succeed");
  }

  assert.equal(
    memberLeave.raidRun.members.find((member) => member.userId === "user-2")?.active,
    false,
  );
  assert.equal(repository.getOpenRaidRunForUser("user-2"), null);

  const reopened = repository.createRecruitingRaidRun({
    runId: "raid-run-2",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "user-2",
    publicChannelId: "channel-2",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });
  assert.equal(reopened.ok, true);
});

test("removeRaidRunMember allows a member to rejoin the same recruiting run", () => {
  const repository = createTestRepository();
  const now = new Date("2026-03-29T10:00:00.000Z");

  const created = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-1",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });
  assert.equal(created.ok, true);

  const joined = repository.addRaidRunMember({
    runId: "raid-run-1",
    userId: "user-2",
    expectedVersion: 1,
    now,
    partySizeLimit: 4,
  });
  assert.equal(joined.ok, true);
  if (!joined.ok) {
    throw new Error("expected member join to succeed");
  }

  const left = repository.removeRaidRunMember({
    runId: "raid-run-1",
    userId: "user-2",
    expectedVersion: joined.raidRun.run.version,
    now: new Date("2026-03-29T10:02:00.000Z"),
  });
  assert.equal(left.ok, true);
  if (!left.ok) {
    throw new Error("expected member leave to succeed");
  }

  const rejoined = repository.addRaidRunMember({
    runId: "raid-run-1",
    userId: "user-2",
    expectedVersion: left.raidRun.run.version,
    now: new Date("2026-03-29T10:03:00.000Z"),
    partySizeLimit: 4,
  });
  assert.equal(rejoined.ok, true);
  if (!rejoined.ok) {
    throw new Error("expected member rejoin to succeed");
  }

  const activeMembers = rejoined.raidRun.members.filter((member) => member.active);
  assert.deepEqual(
    activeMembers.map((member) => member.userId),
    ["leader-1", "user-2"],
  );
  assert.equal(rejoined.raidRun.members.filter((member) => member.userId === "user-2").length, 1);
});

test("updateRaidRun and closeRaidRun persist lifecycle fields and release active membership", () => {
  const repository = createTestRepository();
  const createdAt = new Date("2026-03-29T10:00:00.000Z");
  const updateAt = new Date("2026-03-29T10:05:00.000Z");
  const closeAt = new Date("2026-03-29T10:10:00.000Z");

  const created = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-1",
    recruitmentExpiresAt: new Date(createdAt.getTime() + raidRecruitmentDurationMs),
    now: createdAt,
  });
  assert.equal(created.ok, true);

  const updated = repository.updateRaidRun({
    runId: "raid-run-1",
    expectedVersion: 1,
    now: updateAt,
    status: "provisioning",
    publicMessageId: "message-1",
    privateChannelId: "private-channel-1",
    participantRoleId: "role-1",
    encounterStartsAt: updateAt,
    encounterExpiresAt: new Date(updateAt.getTime() + raidEncounterDurationMs),
    versionDelta: 1,
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) {
    throw new Error("expected the run update to succeed");
  }

  assert.equal(updated.raidRun.run.status, "provisioning");
  assert.equal(updated.raidRun.run.isOpen, true);
  assert.equal(updated.raidRun.run.version, 2);
  assert.equal(updated.raidRun.run.publicMessageId, "message-1");
  assert.equal(updated.raidRun.run.privateChannelId, "private-channel-1");
  assert.equal(updated.raidRun.run.participantRoleId, "role-1");
  assert.equal(updated.raidRun.run.encounterStartsAt?.getTime(), updateAt.getTime());
  assert.equal(
    updated.raidRun.run.encounterExpiresAt?.getTime(),
    updateAt.getTime() + raidEncounterDurationMs,
  );

  const closed = repository.closeRaidRun({
    runId: "raid-run-1",
    expectedVersion: 2,
    status: "cancelled",
    now: closeAt,
  });
  assert.equal(closed.ok, true);
  if (!closed.ok) {
    throw new Error("expected the run close to succeed");
  }

  assert.equal(closed.raidRun.run.status, "cancelled");
  assert.equal(closed.raidRun.run.isOpen, false);
  assert.equal(closed.raidRun.run.version, 3);
  assert.ok(closed.raidRun.members.every((member) => member.active === false));
  assert.equal(repository.getOpenRaidRunForUser("leader-1"), null);

  const reopened = repository.createRecruitingRaidRun({
    runId: "raid-run-2",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-2",
    recruitmentExpiresAt: new Date(closeAt.getTime() + raidRecruitmentDurationMs),
    now: closeAt,
  });
  assert.equal(reopened.ok, true);
});

test("updateRaidRunStoredReferences can persist cleanup pointers without an optimistic version match", () => {
  const repository = createTestRepository();
  const now = new Date("2026-03-29T10:00:00.000Z");

  const created = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-1",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });
  assert.equal(created.ok, true);

  const updated = repository.updateRaidRunStoredReferences({
    runId: "raid-run-1",
    now: new Date("2026-03-29T10:01:00.000Z"),
    publicMessageId: "message-1",
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) {
    throw new Error("expected reference update to succeed");
  }

  assert.equal(updated.raidRun.run.status, "recruiting");
  assert.equal(updated.raidRun.run.isOpen, true);
  assert.equal(updated.raidRun.run.publicMessageId, "message-1");
  assert.ok(updated.raidRun.members.every((member) => member.active === true));
});

test("updateRaidRunStoredReferences can close an open run as interrupted for cleanup", () => {
  const repository = createTestRepository();
  const now = new Date("2026-03-29T10:00:00.000Z");

  const created = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-1",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });
  assert.equal(created.ok, true);

  const updated = repository.updateRaidRunStoredReferences({
    runId: "raid-run-1",
    now: new Date("2026-03-29T10:01:00.000Z"),
    publicMessageId: "message-1",
    closeOpenRunAsInterrupted: true,
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) {
    throw new Error("expected reference update to succeed");
  }

  assert.equal(updated.raidRun.run.status, "interrupted");
  assert.equal(updated.raidRun.run.isOpen, false);
  assert.equal(updated.raidRun.run.publicMessageId, "message-1");
  assert.ok(updated.raidRun.members.every((member) => member.active === false));
});

test("updateRaidRunStoredReferences does not interrupt non-recruiting open runs", () => {
  const repository = createTestRepository();
  const now = new Date("2026-03-29T10:00:00.000Z");

  const created = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-dragon",
    leaderUserId: "leader-1",
    publicChannelId: "channel-1",
    recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
    now,
  });
  assert.equal(created.ok, true);

  const provisioning = repository.updateRaidRun({
    runId: "raid-run-1",
    expectedVersion: 1,
    now: new Date("2026-03-29T10:01:00.000Z"),
    status: "provisioning",
    versionDelta: 1,
  });
  assert.equal(provisioning.ok, true);
  if (!provisioning.ok) {
    throw new Error("expected provisioning update to succeed");
  }

  const updated = repository.updateRaidRunStoredReferences({
    runId: "raid-run-1",
    now: new Date("2026-03-29T10:02:00.000Z"),
    publicMessageId: "message-1",
    closeOpenRunAsInterrupted: true,
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) {
    throw new Error("expected reference update to succeed");
  }

  assert.equal(updated.raidRun.run.status, "provisioning");
  assert.equal(updated.raidRun.run.isOpen, true);
  assert.equal(updated.raidRun.run.publicMessageId, "message-1");
  assert.ok(updated.raidRun.members.every((member) => member.active === true));
});

test("listRaidRunsByStatuses returns only matching runs in creation order", () => {
  const repository = createTestRepository();
  const now = new Date("2026-03-29T10:00:00.000Z");

  const createRun = (runId: string, leaderUserId: string) => {
    const result = repository.createRecruitingRaidRun({
      runId,
      tierId: "bronze",
      bossId: "bone-dragon",
      leaderUserId,
      publicChannelId: `${runId}-channel`,
      recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
      now,
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(`expected ${runId} to be created`);
    }
  };

  createRun("raid-run-1", "leader-1");
  createRun("raid-run-2", "leader-2");
  createRun("raid-run-3", "leader-3");

  const provisioned = repository.updateRaidRun({
    runId: "raid-run-2",
    expectedVersion: 1,
    now,
    status: "provisioned",
    versionDelta: 1,
  });
  assert.equal(provisioned.ok, true);

  const cancelled = repository.closeRaidRun({
    runId: "raid-run-3",
    expectedVersion: 1,
    status: "cancelled",
    now,
  });
  assert.equal(cancelled.ok, true);

  const runs = repository.listRaidRunsByStatuses(["recruiting", "provisioned"]);
  assert.deepEqual(
    runs.map((raidRun) => raidRun.run.runId),
    ["raid-run-1", "raid-run-2"],
  );
  assert.deepEqual(
    runs.map((raidRun) => raidRun.run.status),
    ["recruiting", "provisioned"],
  );
});
