import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../shared/db/schema";
import { getRandomEventAchievementIds } from "../application/achievement-rules";
import { recordRandomEventAchievementStats } from "./achievement-stats-repository";
import type {
  RandomEventAppliedNegativeEffect,
  RandomEventAttemptResolution,
} from "./live-runtime-resolution";

const createAttemptResolution = ({
  outcomeResolution = "resolve-failure",
  outcomeEffects = [],
  appliedNegativeEffects = [],
  hadActiveNegativeEffectBeforeAttempt = false,
}: {
  outcomeResolution?: RandomEventAttemptResolution["resolution"];
  outcomeEffects?: RandomEventAttemptResolution["outcome"]["effects"];
  appliedNegativeEffects?: RandomEventAppliedNegativeEffect[];
  hadActiveNegativeEffectBeforeAttempt?: boolean;
} = {}): RandomEventAttemptResolution => ({
  userId: "user-1",
  outcome: {
    id: "outcome-1",
    resolution: outcomeResolution,
    message: "bad luck",
    effects: outcomeEffects,
  },
  renderedOutcomeMessage: "bad luck",
  challengeRollSummary: null,
  effectNotes: [],
  pipReward: 0,
  appliedNegativeEffects,
  hadActiveNegativeEffectBeforeAttempt,
  resolutionNote: null,
  resolution: outcomeResolution,
  finalLine: "",
  failedAttemptLine: "",
});

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
    attemptResolution: createAttemptResolution({
      outcomeEffects: [
        {
          type: "temporary-lockout",
          durationMinutes: 10,
        },
      ],
      appliedNegativeEffects: [
        {
          type: "temporary-lockout",
          expiresAtMs: nowMs + 10 * 60_000,
        },
      ],
    }),
    hadKeepOpenFailureBeforeSuccess: false,
    nowMs,
  });

  const second = recordRandomEventAchievementStats(db, {
    selection,
    userId: "user-1",
    attemptResolution: createAttemptResolution({
      outcomeEffects: [
        {
          type: "temporary-roll-penalty",
          divisor: 2,
          rolls: 1,
          stackMode: "replace",
        },
      ],
      appliedNegativeEffects: [
        {
          type: "temporary-roll-penalty",
        },
      ],
      hadActiveNegativeEffectBeforeAttempt: true,
    }),
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

test("shield-blocked negative outcomes do not count as applied negative achievements", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);

  const selection = {
    scenario: {
      claimPolicy: "first-click",
      rarity: "rare",
    },
  } as const as Parameters<typeof recordRandomEventAchievementStats>[1]["selection"];

  const result = recordRandomEventAchievementStats(db, {
    selection,
    userId: "user-1",
    attemptResolution: createAttemptResolution({
      outcomeEffects: [
        {
          type: "temporary-lockout",
          durationMinutes: 10,
        },
      ],
      hadActiveNegativeEffectBeforeAttempt: true,
    }),
    hadKeepOpenFailureBeforeSuccess: false,
    nowMs: 1_710_000_000_000,
  });

  assert.equal(result.stats.failureCount, 1);
  assert.equal(result.stats.lockoutCount, 0);
  assert.equal(result.cursedEvening, false);
  assert.deepEqual(
    getRandomEventAchievementIds(result.stats, { cursedEvening: result.cursedEvening }),
    ["random-event-first-failure"],
  );
});
