import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../shared/db/schema";
import { getDiceWorldBossAchievementIds } from "../application/achievement-rules";
import { recordWorldBossSuccessResolution } from "./achievement-stats-repository";

test("world boss achievement stats award World Boss Tourist for non-eligible successful joins", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);

  const stats = recordWorldBossSuccessResolution(db, {
    userId: "user-1",
    bossLevel: 20,
    rewardEligible: false,
    topDamage: false,
    tourist: true,
  });

  assert.ok(getDiceWorldBossAchievementIds(stats).includes("world-boss-tourist"));
  assert.ok(!getDiceWorldBossAchievementIds(stats).includes("world-boss-first-clear"));
});
