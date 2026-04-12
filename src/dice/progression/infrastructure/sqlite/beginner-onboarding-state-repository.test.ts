import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteBeginnerOnboardingStateRepository } from "./beginner-onboarding-state-repository";

test("beginner onboarding graduation state tracks per guild while achievements stay global", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const onboarding = createSqliteBeginnerOnboardingStateRepository(db);

  db.prepare(
    `
      INSERT INTO user_achievements (user_id, achievement_id, earned_at)
      VALUES (?, ?, ?)
    `,
  ).run("user-1", "manual-rolls-5", "2026-04-12T13:00:00.000Z");

  assert.equal(onboarding.hasBeginnerRollerAchievement("user-1"), true);
  assert.equal(onboarding.hasGuildGraduated("guild-1", "user-1"), false);
  assert.equal(onboarding.markGuildGraduated("guild-1", "user-1"), true);
  assert.equal(onboarding.markGuildGraduated("guild-1", "user-1"), false);
  assert.equal(onboarding.hasGuildGraduated("guild-1", "user-1"), true);
  assert.equal(onboarding.hasGuildGraduated("guild-2", "user-1"), false);
});
