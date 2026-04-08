import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteRaidRunRepository } from "./raid-run-repository";
import { createSqliteRaidRewardStateRepository } from "./reward-state-repository";

const createRepository = () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initializeDatabaseSchema(db as never);
  const runRepository = createSqliteRaidRunRepository(db as never);
  const now = new Date("2026-04-08T10:00:00.000Z");
  const created = runRepository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: "bone-drake",
    leaderUserId: "leader-1",
    publicChannelId: "panel-channel",
    recruitmentExpiresAt: new Date(now.getTime() + 60_000),
    now,
  });
  if (!created.ok) {
    throw new Error("expected raid run creation to succeed");
  }

  return {
    db,
    repository: createSqliteRaidRewardStateRepository(db as never),
  };
};

test("raid reward state claims each tier first clear only once per user", () => {
  const { db, repository } = createRepository();

  try {
    assert.equal(
      repository.claimTierFirstClear({
        userId: "leader-1",
        tierId: "bronze",
        runId: "raid-run-1",
        clearedAt: new Date("2026-04-08T10:05:00.000Z"),
      }),
      true,
    );
    assert.equal(
      repository.claimTierFirstClear({
        userId: "leader-1",
        tierId: "bronze",
        runId: "raid-run-1",
        clearedAt: new Date("2026-04-08T10:06:00.000Z"),
      }),
      false,
    );

    const firstClear = repository.getTierFirstClear({
      userId: "leader-1",
      tierId: "bronze",
    });

    assert.equal(firstClear?.runId, "raid-run-1");
    assert.equal(firstClear?.clearedAt.toISOString(), "2026-04-08T10:05:00.000Z");
  } finally {
    db.close();
  }
});
