import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteWorldBossDoubleRollRushZoneRepository } from "./double-roll-rush-zone-repository";

const createRepository = () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db as never);
  return {
    db,
    repository: createSqliteWorldBossDoubleRollRushZoneRepository(db as never),
  };
};

test("Double Roll Rush repository returns active zones by channel id until expiry", () => {
  const { db, repository } = createRepository();

  try {
    repository.createZone({
      rushId: "rush-1",
      sourceWorldBossId: "world-boss-1",
      parentChannelId: "world-boss-channel",
      rushChannelId: "rush-thread-1",
      kickoffMessageId: "kickoff-1",
      activatedAt: new Date("2026-04-01T10:00:00.000Z"),
      expiresAt: new Date("2026-04-01T10:15:00.000Z"),
    });

    const active = repository.getActiveZoneByChannelId({
      channelId: "rush-thread-1",
      now: new Date("2026-04-01T10:05:00.000Z"),
    });

    assert.equal(active?.rushId, "rush-1");
    assert.equal(active?.sourceWorldBossId, "world-boss-1");
  } finally {
    db.close();
  }
});

test("Double Roll Rush repository closes expired zones before channel lookup", () => {
  const { db, repository } = createRepository();

  try {
    repository.createZone({
      rushId: "rush-1",
      sourceWorldBossId: "world-boss-1",
      parentChannelId: "world-boss-channel",
      rushChannelId: "rush-thread-1",
      kickoffMessageId: "kickoff-1",
      activatedAt: new Date("2026-04-01T10:00:00.000Z"),
      expiresAt: new Date("2026-04-01T10:15:00.000Z"),
    });

    const active = repository.getActiveZoneByChannelId({
      channelId: "rush-thread-1",
      now: new Date("2026-04-01T10:16:00.000Z"),
    });
    const closed = repository.closeZone({
      rushId: "rush-1",
      closeReason: "manual-close-check",
      now: new Date("2026-04-01T10:17:00.000Z"),
    });

    assert.equal(active, null);
    assert.equal(closed?.closeReason, "expired");
    assert.ok(closed?.closedAt);
  } finally {
    db.close();
  }
});

test("Double Roll Rush repository lists only still-open zones", () => {
  const { db, repository } = createRepository();

  try {
    repository.createZone({
      rushId: "rush-1",
      sourceWorldBossId: "world-boss-1",
      parentChannelId: "world-boss-channel",
      rushChannelId: "rush-thread-1",
      kickoffMessageId: "kickoff-1",
      activatedAt: new Date("2026-04-01T10:00:00.000Z"),
      expiresAt: new Date("2026-04-01T10:15:00.000Z"),
    });
    repository.createZone({
      rushId: "rush-2",
      sourceWorldBossId: "world-boss-2",
      parentChannelId: "world-boss-channel",
      rushChannelId: "rush-thread-2",
      kickoffMessageId: "kickoff-2",
      activatedAt: new Date("2026-04-01T11:00:00.000Z"),
      expiresAt: new Date("2026-04-01T11:15:00.000Z"),
    });
    repository.closeZone({
      rushId: "rush-1",
      closeReason: "missing-channel",
      now: new Date("2026-04-01T10:05:00.000Z"),
    });

    const openZones = repository.listOpenZones({
      now: new Date("2026-04-01T10:10:00.000Z"),
    });

    assert.deepEqual(
      openZones.map((zone) => zone.rushId),
      ["rush-2"],
    );
  } finally {
    db.close();
  }
});

test("Double Roll Rush repository can list closed zones for cleanup recovery", () => {
  const { db, repository } = createRepository();

  try {
    repository.createZone({
      rushId: "rush-1",
      sourceWorldBossId: "world-boss-1",
      parentChannelId: "world-boss-channel",
      rushChannelId: "rush-thread-1",
      kickoffMessageId: "kickoff-1",
      activatedAt: new Date("2026-04-01T10:00:00.000Z"),
      expiresAt: new Date("2026-04-01T10:15:00.000Z"),
    });
    repository.closeZone({
      rushId: "rush-1",
      closeReason: "expired",
      now: new Date("2026-04-01T10:20:00.000Z"),
    });

    const closedZones = repository.listClosedZones();

    assert.deepEqual(
      closedZones.map((zone) => ({
        rushId: zone.rushId,
        closeReason: zone.closeReason,
      })),
      [
        {
          rushId: "rush-1",
          closeReason: "expired",
        },
      ],
    );
  } finally {
    db.close();
  }
});
