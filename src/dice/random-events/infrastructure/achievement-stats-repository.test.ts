import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../shared/db/schema";
import { getRandomEventAchievementIds } from "../application/achievement-rules";
import { recordRandomEventAchievementStats } from "./achievement-stats-repository";

test("random-event achievement stats trigger Cursed Evening on overlapping negative effects", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);

  const selection = {
    scenario: {
      claimPolicy: "first-click",
      rarity: "rare",
    },
  } as const as Parameters<typeof recordRandomEventAchievementStats>[1]["selection"];
  const nowMs = 1_710_000_000_000;

  recordRandomEventAchievementStats(db, {
    selection,
    userId: "user-1",
    attemptResolution: {
      userId: "user-1",
      outcome: {
        id: "lockout",
        resolution: "resolve-failure",
        message: "bad luck",
        effects: [
          {
            type: "temporary-lockout",
            durationMinutes: 10,
          },
        ],
      },
      renderedOutcomeMessage: "bad luck",
      challengeRollSummary: null,
      effectNotes: [],
      resolutionNote: null,
      resolution: "resolve-failure",
      finalLine: "",
      failedAttemptLine: "",
    } as Parameters<typeof recordRandomEventAchievementStats>[1]["attemptResolution"],
    hadKeepOpenFailureBeforeSuccess: false,
    nowMs,
  });

  const second = recordRandomEventAchievementStats(db, {
    selection,
    userId: "user-1",
    attemptResolution: {
      userId: "user-1",
      outcome: {
        id: "penalty",
        resolution: "resolve-failure",
        message: "still bad",
        effects: [
          {
            type: "temporary-roll-penalty",
            divisor: 2,
            rolls: 1,
            stackMode: "replace",
          },
        ],
      },
      renderedOutcomeMessage: "still bad",
      challengeRollSummary: null,
      effectNotes: [],
      resolutionNote: null,
      resolution: "resolve-failure",
      finalLine: "",
      failedAttemptLine: "",
    } as Parameters<typeof recordRandomEventAchievementStats>[1]["attemptResolution"],
    hadKeepOpenFailureBeforeSuccess: false,
    nowMs: nowMs + 60_000,
  });

  assert.equal(second.cursedEvening, true);
  assert.ok(
    getRandomEventAchievementIds(second.stats, { cursedEvening: second.cursedEvening }).includes(
      "cursed-evening",
    ),
  );
});
