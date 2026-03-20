import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../shared/db/schema";
import { getDiceRaidAchievementIds } from "../application/achievement-rules";
import { recordRaidSuccessResolution } from "./achievement-stats-repository";

test("raid achievement stats award Raid Tourist for non-eligible successful joins", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);

  const stats = recordRaidSuccessResolution(db, {
    userId: "user-1",
    bossLevel: 20,
    rewardEligible: false,
    topDamage: false,
    tourist: true,
  });

  assert.ok(getDiceRaidAchievementIds(stats).includes("raid-tourist"));
  assert.ok(!getDiceRaidAchievementIds(stats).includes("raid-first-clear"));
});
