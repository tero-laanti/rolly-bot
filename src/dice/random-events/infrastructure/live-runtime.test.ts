import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import Database from "better-sqlite3";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { initializeDatabaseSchema } from "../../../shared/db/schema";
import { createSqliteEconomyRepository } from "../../economy/infrastructure/sqlite/balance-repository";
import { renderRandomEventScenario, type RandomEventScenario } from "../domain/content";
import { createRandomEventsState, registerActiveRandomEvent } from "./state-store";

const moduleRequire = createRequire(__filename);

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

const baseConfig: RandomEventsFoundationConfig = {
  enabled: true,
  inactiveReason: null,
  channelId: "events-channel",
  targetEventsPerDay: 0,
  minGapMs: 1,
  maxActiveEvents: 1,
  retryDelayMs: 1,
  jitterRatio: 0,
  quietHours: {
    start: "00:00",
    end: "00:00",
    timezone: "UTC",
  },
};

const createNoopMessage = (edits: unknown[]) => {
  const message = {
    id: "message-1",
    channelId: "events-channel",
    edit: async (payload: unknown) => {
      edits.push(payload);
      return message as never;
    },
  };

  return message;
};

const createBaseScenario = (): RandomEventScenario => ({
  id: "test-scenario",
  rarity: "rare",
  title: "Test Scenario",
  prompt: "A test event appears.",
  claimLabel: "Claim",
  claimPolicy: "first-click",
  claimWindowSeconds: 30,
  outcomes: [],
});

const withPatchedRuntime = async (
  options: {
    scenario: RandomEventScenario;
    flowState:
      | { type: "single-resolution" }
      | {
          type: "solo-ladder";
          ownerUserId: string | null;
          stageIndex: number;
          resolvedLines: string[];
        }
      | {
          type: "solo-push-your-luck";
          ownerUserId: string | null;
          stageIndex: number;
          resolvedLines: string[];
          potEffects: RandomEventScenario["outcomes"][number]["effects"];
        }
      | {
          type: "group-meter";
          stageIndex: number;
          stageProgress: number;
          resolvedLines: string[];
          successfulParticipantUserIds: Set<string>;
          participantUserIds: Set<string>;
          currentStageContributorUserIds: Set<string>;
          currentStageAttemptedUserIds: Set<string>;
        }
      | { type: "stake-offer"; ownerUserId: string | null };
    baseDurationMs?: number;
    estimatedExpiresAtMs?: number;
  },
  run: (context: {
    runtime: import("./live-runtime").RandomEventsLiveRuntime;
    state: ReturnType<typeof createRandomEventsState>;
    db: Database.Database;
    publishedAnnouncements: Array<{ userId: string; achievementIds: string[] }>;
    messageEdits: unknown[];
  }) => Promise<void>,
): Promise<void> => {
  const modulePaths = [
    "../../../shared/db",
    "../../../app/discord/achievement-effects",
    "../../../app/discord/achievement-announcements",
    "../../progression/application/achievement-awards",
    "./live-runtime-trigger",
    "./live-runtime",
  ] as const;
  clearModules(modulePaths);

  const db = new Database(":memory:");
  initializeDatabaseSchema(db as never);

  const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
  const originalGetDatabase = sharedDb.getDatabase;
  const achievementEffectsModule = moduleRequire(
    "../../../app/discord/achievement-effects",
  ) as typeof import("../../../app/discord/achievement-effects");
  const originalPublishAchievementEffects = achievementEffectsModule.publishAchievementEffects;
  const achievementAwardsModule = moduleRequire(
    "../../progression/application/achievement-awards",
  ) as typeof import("../../progression/application/achievement-awards");
  const originalAwardManualDiceAchievements = achievementAwardsModule.awardManualDiceAchievements;
  const triggerModule = moduleRequire(
    "./live-runtime-trigger",
  ) as typeof import("./live-runtime-trigger");
  const originalTriggerRandomEventOpportunity = triggerModule.triggerRandomEventOpportunity;

  const publishedAnnouncements: Array<{ userId: string; achievementIds: string[] }> = [];
  const messageEdits: unknown[] = [];
  const state = createRandomEventsState();
  let runtime: import("./live-runtime").RandomEventsLiveRuntime | null = null;

  try {
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
    (
      achievementEffectsModule as {
        publishAchievementEffects: typeof achievementEffectsModule.publishAchievementEffects;
      }
    ).publishAchievementEffects = async ({ announcements }) => {
      publishedAnnouncements.push(
        ...announcements.map((announcement) => ({
          userId: announcement.userId,
          achievementIds: [...announcement.achievementIds],
        })),
      );
    };
    (
      achievementAwardsModule as {
        awardManualDiceAchievements: typeof achievementAwardsModule.awardManualDiceAchievements;
      }
    ).awardManualDiceAchievements = (_progression, _userId, achievementIds) => [...achievementIds];
    (
      triggerModule as {
        triggerRandomEventOpportunity: typeof triggerModule.triggerRandomEventOpportunity;
      }
    ).triggerRandomEventOpportunity = async ({ activeEventsById }) => {
      const eventId = "event-1";
      activeEventsById.set(eventId, {
        eventId,
        selection: renderRandomEventScenario(options.scenario, { random: () => 0 }),
        message: createNoopMessage(messageEdits) as never,
        flowState: options.flowState,
        sequenceChallenge: null,
        phaseTimer: null,
        baseDurationMs: options.baseDurationMs ?? 30_000,
        currentPhaseExpiresAtMs: options.estimatedExpiresAtMs ?? 1_000,
        attemptedUserIds: new Set<string>(),
        failedAttemptLines: [],
        failedAttemptUserIds: new Set<string>(),
      });

      return {
        created: true,
        eventId,
        expiresAt: new Date(options.estimatedExpiresAtMs ?? 1_000),
      };
    };

    const { createRandomEventsLiveRuntime } = moduleRequire(
      "./live-runtime",
    ) as typeof import("./live-runtime");
    runtime = createRandomEventsLiveRuntime({
      client: {
        channels: {
          fetch: async () => null,
        },
      } as never,
      config: baseConfig,
      state,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await run({
      runtime,
      state,
      db,
      publishedAnnouncements,
      messageEdits,
    });
  } finally {
    if (runtime) {
      runtime.stop();
    }

    (
      sharedDb as {
        getDatabase: typeof sharedDb.getDatabase;
      }
    ).getDatabase = originalGetDatabase;
    (
      achievementEffectsModule as {
        publishAchievementEffects: typeof achievementEffectsModule.publishAchievementEffects;
      }
    ).publishAchievementEffects = originalPublishAchievementEffects;
    (
      achievementAwardsModule as {
        awardManualDiceAchievements: typeof achievementAwardsModule.awardManualDiceAchievements;
      }
    ).awardManualDiceAchievements = originalAwardManualDiceAchievements;
    (
      triggerModule as {
        triggerRandomEventOpportunity: typeof triggerModule.triggerRandomEventOpportunity;
      }
    ).triggerRandomEventOpportunity = originalTriggerRandomEventOpportunity;
    db.close();
    clearModules(modulePaths);
  }
};

test("solo-ladder resolutions publish random-event achievement announcements", async () => {
  const scenario: RandomEventScenario = {
    ...createBaseScenario(),
    flow: {
      type: "solo-ladder",
      stages: [
        {
          id: "stage-one",
          label: "Stage One",
          prompt: "Climb.",
          actionLabel: "Climb",
          rollChallenge: {
            id: "ladder-check",
            mode: "single-step",
            steps: [
              {
                id: "ladder-step",
                label: "Roll 1+ on d2",
                source: { type: "static-die", sides: 2 },
                target: 1,
                comparator: "gte",
              },
            ],
          },
          successMessage: "You make it across.",
          successEffects: [{ type: "currency", minAmount: 3, maxAmount: 3 }],
          failureMessage: "You fall.",
          failureEffects: [],
        },
      ],
    },
  };

  await withPatchedRuntime(
    {
      scenario,
      flowState: {
        type: "solo-ladder",
        ownerUserId: null,
        stageIndex: 0,
        resolvedLines: [],
      },
    },
    async ({ runtime, publishedAnnouncements }) => {
      const result = await runtime.onTriggerOpportunity({ now: new Date(0) });
      assert.equal(result?.created, true);

      let deferred = false;
      const replies: unknown[] = [];
      const followUps: unknown[] = [];
      await runtime.handleButtonInteraction({
        customId: "random-event:event-1:claim",
        user: { id: "user-1" },
        deferUpdate: async () => {
          deferred = true;
        },
        reply: async (payload: unknown) => {
          replies.push(payload);
        },
        followUp: async (payload: unknown) => {
          followUps.push(payload);
        },
      } as never);

      assert.equal(deferred, true);
      assert.deepEqual(replies, []);
      assert.deepEqual(followUps, []);
      assert.deepEqual(publishedAnnouncements, [
        {
          userId: "user-1",
          achievementIds: ["random-event-first-success"],
        },
      ]);
    },
  );
});

test("group-meter keep-open failures publish failure achievements immediately", async () => {
  const scenario: RandomEventScenario = {
    ...createBaseScenario(),
    claimPolicy: "multi-user",
    flow: {
      type: "group-meter",
      stages: [
        {
          id: "meter-one",
          label: "Meter One",
          prompt: "Hold the line.",
          actionLabel: "Join",
          requiredSuccesses: 2,
          rollChallenge: {
            id: "meter-check",
            mode: "single-step",
            steps: [
              {
                id: "meter-step",
                label: "Roll 3+ on d2",
                source: { type: "static-die", sides: 2 },
                target: 3,
                comparator: "gte",
              },
            ],
          },
          successMessage: "The line holds.",
          successEffects: [{ type: "currency", minAmount: 2, maxAmount: 2 }],
          failureMessage: "The line breaks around you.",
          failureEffects: [{ type: "temporary-lockout", durationMinutes: 5 }],
          failureResolution: "keep-open",
        },
      ],
    },
  };

  await withPatchedRuntime(
    {
      scenario,
      flowState: {
        type: "group-meter",
        stageIndex: 0,
        stageProgress: 0,
        resolvedLines: [],
        successfulParticipantUserIds: new Set<string>(),
        participantUserIds: new Set<string>(),
        currentStageContributorUserIds: new Set<string>(),
        currentStageAttemptedUserIds: new Set<string>(),
      },
    },
    async ({ runtime, publishedAnnouncements }) => {
      const result = await runtime.onTriggerOpportunity({ now: new Date(0) });
      assert.equal(result?.created, true);

      let deferred = false;
      await runtime.handleButtonInteraction({
        customId: "random-event:event-1:join",
        user: { id: "user-1" },
        deferUpdate: async () => {
          deferred = true;
        },
        reply: async () => undefined,
        followUp: async () => undefined,
      } as never);

      assert.equal(deferred, true);
      assert.deepEqual(publishedAnnouncements, [
        {
          userId: "user-1",
          achievementIds: ["random-event-first-failure", "random-event-lockout"],
        },
      ]);
    },
  );
});

test("group-meter stages allow the same successful party to continue into the next stage", async () => {
  const originalRandom = Math.random;
  const originalDateNow = Date.now;
  let currentNowMs = 10_000;
  Math.random = () => 0;
  Date.now = () => currentNowMs;

  const scenario: RandomEventScenario = {
    ...createBaseScenario(),
    claimPolicy: "multi-user",
    flow: {
      type: "group-meter",
      stages: [
        {
          id: "meter-one",
          label: "Meter One",
          prompt: "Get two voices on beat.",
          actionLabel: "Sing",
          requiredSuccesses: 2,
          rollChallenge: {
            id: "meter-one-check",
            mode: "single-step",
            steps: [
              {
                id: "meter-one-step",
                label: "Roll 1+ on d2",
                source: { type: "static-die", sides: 2 },
                target: 1,
                comparator: "gte",
              },
            ],
          },
          successMessage: "The first harmony lands.",
          successEffects: [{ type: "currency", minAmount: 2, maxAmount: 2 }],
          failureMessage: "You miss the beat.",
          failureEffects: [],
          failureResolution: "keep-open",
        },
        {
          id: "meter-two",
          label: "Meter Two",
          prompt: "Push into the second verse.",
          actionLabel: "Raise chorus",
          requiredSuccesses: 2,
          rollChallenge: {
            id: "meter-two-check",
            mode: "single-step",
            steps: [
              {
                id: "meter-two-step",
                label: "Roll 1+ on d2",
                source: { type: "static-die", sides: 2 },
                target: 1,
                comparator: "gte",
              },
            ],
          },
          successMessage: "The chorus rises higher.",
          successEffects: [{ type: "currency", minAmount: 3, maxAmount: 3 }],
          failureMessage: "The verse slips.",
          failureEffects: [],
          failureResolution: "keep-open",
        },
      ],
    },
  };

  try {
    await withPatchedRuntime(
      {
        scenario,
        flowState: {
          type: "group-meter",
          stageIndex: 0,
          stageProgress: 0,
          resolvedLines: [],
          successfulParticipantUserIds: new Set<string>(),
          participantUserIds: new Set<string>(),
          currentStageContributorUserIds: new Set<string>(),
          currentStageAttemptedUserIds: new Set<string>(),
        },
      },
      async ({ runtime, db, messageEdits }) => {
        const economy = createSqliteEconomyRepository(db as never);
        const result = await runtime.onTriggerOpportunity({ now: new Date(0) });
        assert.equal(result?.created, true);

        const join = async (userId: string) => {
          currentNowMs += 3_000;
          await runtime.handleButtonInteraction({
            customId: "random-event:event-1:join",
            user: { id: userId },
            deferUpdate: async () => undefined,
            reply: async () => undefined,
            followUp: async () => undefined,
          } as never);
        };

        await join("user-1");
        await join("user-2");

        assert.ok(
          messageEdits.some((payload) => {
            const serialized = JSON.stringify(payload);
            return serialized.includes("Meter Two") && serialized.includes("Progress: 0/2.");
          }),
        );

        await join("user-1");
        await join("user-2");

        assert.equal(economy.getPips("user-1"), 5);
        assert.equal(economy.getPips("user-2"), 6);
      },
    );
  } finally {
    Math.random = originalRandom;
    Date.now = originalDateNow;
  }
});

test("stake offers release ownership after an insufficient-funds continue and still publish achievements", async () => {
  const originalDateNow = Date.now;
  let currentNowMs = 10_000;
  Date.now = () => currentNowMs;

  const scenario: RandomEventScenario = {
    ...createBaseScenario(),
    flow: {
      type: "stake-offer",
      stakePips: 5,
      acceptLabel: "Take deal",
      declineLabel: "Pass",
      declineMessage: "The offer passes by.",
    },
    outcomes: [
      {
        id: "deal-win",
        resolution: "resolve-success",
        message: "The deal pays out.",
        effects: [{ type: "currency", minAmount: 8, maxAmount: 8 }],
      },
    ],
  };

  try {
    await withPatchedRuntime(
      {
        scenario,
        flowState: {
          type: "stake-offer",
          ownerUserId: null,
        },
      },
      async ({ runtime, db, publishedAnnouncements }) => {
        const economy = createSqliteEconomyRepository(db as never);
        economy.applyPipsDelta({ userId: "user-1", amount: 6 });
        economy.applyPipsDelta({ userId: "user-2", amount: 12 });

        const result = await runtime.onTriggerOpportunity({ now: new Date(currentNowMs) });
        assert.equal(result?.created, true);

        const userOneClaimFollowUps: Array<{ content: string; ephemeral: boolean }> = [];
        await runtime.handleButtonInteraction({
          customId: "random-event:event-1:claim",
          user: { id: "user-1" },
          deferUpdate: async () => undefined,
          reply: async () => undefined,
          followUp: async (payload: { content: string; ephemeral: boolean }) => {
            userOneClaimFollowUps.push(payload);
          },
        } as never);
        assert.deepEqual(userOneClaimFollowUps, []);
        assert.equal(runtime.getActiveEventsSnapshot()[0]?.participantCount, 1);

        economy.applyPipsDelta({ userId: "user-1", amount: -6 });
        currentNowMs = 13_000;

        const userOneFollowUps: Array<{ content: string; ephemeral: boolean }> = [];
        await runtime.handleButtonInteraction({
          customId: "random-event:event-1:continue",
          user: { id: "user-1" },
          deferUpdate: async () => undefined,
          reply: async () => undefined,
          followUp: async (payload: { content: string; ephemeral: boolean }) => {
            userOneFollowUps.push(payload);
          },
        } as never);

        assert.deepEqual(userOneFollowUps, [
          {
            content: "You do not have enough pips to take this deal.",
            ephemeral: true,
          },
        ]);
        assert.equal(runtime.getActiveEventsSnapshot()[0]?.participantCount, 0);

        currentNowMs = 16_000;
        await runtime.handleButtonInteraction({
          customId: "random-event:event-1:claim",
          user: { id: "user-2" },
          deferUpdate: async () => undefined,
          reply: async () => undefined,
          followUp: async () => undefined,
        } as never);

        currentNowMs = 19_000;
        await runtime.handleButtonInteraction({
          customId: "random-event:event-1:continue",
          user: { id: "user-2" },
          deferUpdate: async () => undefined,
          reply: async () => undefined,
          followUp: async () => undefined,
        } as never);

        assert.deepEqual(publishedAnnouncements, [
          {
            userId: "user-2",
            achievementIds: ["random-event-first-success"],
          },
        ]);
      },
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test("stake offer prompts use live status copy before anyone declines", async () => {
  const scenario: RandomEventScenario = {
    ...createBaseScenario(),
    flow: {
      type: "stake-offer",
      stakePips: 5,
      acceptLabel: "Take deal",
      declineLabel: "Pass",
      declineMessage: "The offer passes by.",
    },
    outcomes: [
      {
        id: "deal-win",
        resolution: "resolve-success",
        message: "The deal pays out.",
        effects: [{ type: "currency", minAmount: 8, maxAmount: 8 }],
      },
    ],
  };

  await withPatchedRuntime(
    {
      scenario,
      flowState: {
        type: "stake-offer",
        ownerUserId: null,
      },
    },
    async ({ runtime, messageEdits }) => {
      const result = await runtime.onTriggerOpportunity({ now: new Date(10_000) });
      assert.equal(result?.created, true);

      const description = (messageEdits[0] as { embeds: Array<{ description?: string }> })
        ?.embeds[0]?.description;
      assert.ok(description);
      assert.match(description, /Decline option: Pass\./);
      assert.doesNotMatch(description, /The offer passes by\./);
    },
  );
});

test("stake offer claim refreshes the timer for the current phase", async () => {
  const originalDateNow = Date.now;
  let currentNowMs = 10_000;
  Date.now = () => currentNowMs;

  const scenario: RandomEventScenario = {
    ...createBaseScenario(),
    flow: {
      type: "stake-offer",
      stakePips: 5,
      acceptLabel: "Take deal",
      declineLabel: "Pass",
      declineMessage: "The offer passes by.",
    },
    outcomes: [
      {
        id: "deal-win",
        resolution: "resolve-success",
        message: "The deal pays out.",
        effects: [{ type: "currency", minAmount: 8, maxAmount: 8 }],
      },
    ],
  };

  try {
    await withPatchedRuntime(
      {
        scenario,
        flowState: {
          type: "stake-offer",
          ownerUserId: null,
        },
        baseDurationMs: 10_000,
      },
      async ({ runtime, db }) => {
        const economy = createSqliteEconomyRepository(db as never);
        economy.applyPipsDelta({ userId: "user-1", amount: 10 });

        const result = await runtime.onTriggerOpportunity({ now: new Date(currentNowMs) });
        assert.equal(result?.created, true);
        assert.equal(runtime.getActiveEventsSnapshot()[0]?.expiresAt?.getTime(), 20_000);

        currentNowMs = 19_500;
        await runtime.handleButtonInteraction({
          customId: "random-event:event-1:claim",
          user: { id: "user-1" },
          deferUpdate: async () => undefined,
          reply: async () => undefined,
          followUp: async () => undefined,
        } as never);

        assert.equal(runtime.getActiveEventsSnapshot()[0]?.expiresAt?.getTime(), 29_500);
      },
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test("staged trigger results return the actual post-send expiry for scheduler state registration", async () => {
  const originalDateNow = Date.now;
  Date.now = () => 10_000;

  const scenario: RandomEventScenario = {
    ...createBaseScenario(),
    flow: {
      type: "solo-ladder",
      stages: [
        {
          id: "stage-one",
          label: "Stage One",
          prompt: "Climb.",
          actionLabel: "Climb",
          rollChallenge: {
            id: "ladder-check",
            mode: "single-step",
            steps: [
              {
                id: "ladder-step",
                label: "Roll 1+ on d2",
                source: { type: "static-die", sides: 2 },
                target: 1,
                comparator: "gte",
              },
            ],
          },
          successMessage: "You make it across.",
          successEffects: [{ type: "currency", minAmount: 3, maxAmount: 3 }],
          failureMessage: "You fall.",
          failureEffects: [],
        },
      ],
    },
  };

  try {
    await withPatchedRuntime(
      {
        scenario,
        flowState: {
          type: "solo-ladder",
          ownerUserId: null,
          stageIndex: 0,
          resolvedLines: [],
        },
        baseDurationMs: 5_000,
        estimatedExpiresAtMs: 1_000,
      },
      async ({ runtime, state }) => {
        const result = await runtime.onTriggerOpportunity({ now: new Date(9_000) });
        assert.equal(result?.created, true);
        assert.equal(result?.eventId, "event-1");
        assert.equal(result?.expiresAt?.getTime(), 15_000);

        registerActiveRandomEvent(state, {
          id: "event-1",
          createdAt: new Date(9_000),
          expiresAt: result?.expiresAt ?? null,
        });

        assert.equal(state.activeEventsById.get("event-1")?.expiresAtMs, 15_000);
      },
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test("staged events keep the original total expiry budget when advancing phases", async () => {
  const originalDateNow = Date.now;
  let currentNowMs = 10_000;
  Date.now = () => currentNowMs;

  const scenario: RandomEventScenario = {
    ...createBaseScenario(),
    flow: {
      type: "solo-ladder",
      stages: [
        {
          id: "stage-one",
          label: "Stage One",
          prompt: "Climb the first ledge.",
          actionLabel: "Climb",
          rollChallenge: {
            id: "climb-one",
            mode: "single-step",
            steps: [
              {
                id: "step-one",
                label: "Roll 1+ on d2",
                source: { type: "static-die", sides: 2 },
                target: 1,
                comparator: "gte",
              },
            ],
          },
          successMessage: "You reach the next ledge.",
          successEffects: [],
          failureMessage: "You slip.",
          failureEffects: [],
        },
        {
          id: "stage-two",
          label: "Stage Two",
          prompt: "Finish the climb.",
          actionLabel: "Finish",
          rollChallenge: {
            id: "climb-two",
            mode: "single-step",
            steps: [
              {
                id: "step-two",
                label: "Roll 1+ on d2",
                source: { type: "static-die", sides: 2 },
                target: 1,
                comparator: "gte",
              },
            ],
          },
          successMessage: "You finish the climb.",
          successEffects: [{ type: "currency", minAmount: 3, maxAmount: 3 }],
          failureMessage: "You fall at the end.",
          failureEffects: [],
        },
      ],
    },
  };

  try {
    await withPatchedRuntime(
      {
        scenario,
        flowState: {
          type: "solo-ladder",
          ownerUserId: null,
          stageIndex: 0,
          resolvedLines: [],
        },
        baseDurationMs: 10_000,
      },
      async ({ runtime }) => {
        const result = await runtime.onTriggerOpportunity({ now: new Date(currentNowMs) });
        if (!result || !result.created) {
          assert.fail("Expected staged trigger to create an event.");
        }
        assert.equal(result.expiresAt?.getTime(), 20_000);

        currentNowMs = 12_000;
        await runtime.handleButtonInteraction({
          customId: "random-event:event-1:claim",
          user: { id: "user-1" },
          deferUpdate: async () => undefined,
          reply: async () => undefined,
          followUp: async () => undefined,
        } as never);

        assert.equal(runtime.getActiveEventsSnapshot()[0]?.expiresAt?.getTime(), 20_000);
      },
    );
  } finally {
    Date.now = originalDateNow;
  }
});
