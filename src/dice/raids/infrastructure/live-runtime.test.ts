import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../shared/db/schema";

const moduleRequire = createRequire(__filename);

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

const withEnv = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> => {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    process.env = previous;
  }
};

test("raid join publishes achievement announcements even if the signup prompt edit fails", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: "achievements-channel" }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../app/discord/achievement-announcements",
      "../../../shared/db",
      "../../progression/application/achievement-awards",
      "./live-runtime",
    ] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    const achievementAwards = moduleRequire(
      "../../progression/application/achievement-awards",
    ) as typeof import("../../progression/application/achievement-awards");
    const originalAwardManualDiceAchievements = achievementAwards.awardManualDiceAchievements;
    let runtime: import("./live-runtime").RaidsLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = () => ["raid-join-test"];

      const { createRaidsLiveRuntime } = moduleRequire(
        "./live-runtime",
      ) as typeof import("./live-runtime");
      const publishedPayloads: Array<{
        content: string;
        allowedMentions: {
          parse: string[];
          users: string[];
        };
      }> = [];
      let announcementMessage: {
        id: string;
        channelId: string;
        channel: {
          send: (options: unknown) => Promise<unknown>;
        };
        edit: (payload: unknown) => Promise<unknown>;
      };
      const raidChannel = {
        isTextBased: () => true,
        send: async () => announcementMessage,
      };
      const achievementsChannel = {
        isTextBased: () => true,
        send: async (options: {
          content: string;
          allowedMentions: {
            parse: string[];
            users: string[];
          };
        }) => {
          publishedPayloads.push(options);
          return {} as never;
        },
      };
      announcementMessage = {
        id: "raid-message-1",
        channelId: "raid-channel",
        channel: raidChannel,
        edit: async () => {
          throw new Error("prompt edit failed");
        },
      };

      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "raid-channel") {
              return raidChannel;
            }

            if (channelId === "achievements-channel") {
              return achievementsChannel;
            }

            return null;
          },
        },
      } as never;

      runtime = createRaidsLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "raid-channel",
          joinLeadMs: 60_000,
          activeDurationMs: 60_000,
          targetRaidsPerDay: 0,
          minGapMs: 1,
          retryDelayMs: 1,
          jitterRatio: 0,
          quietHours: {
            start: "00:00",
            end: "00:00",
            timezone: "UTC",
          },
        },
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      const triggerResult = await runtime.triggerRaidNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live raid to be created.");
      }

      let deferred = false;
      const replies: Array<{ content: string; ephemeral: boolean }> = [];
      await runtime.handleButtonInteraction({
        customId: `raid-join:${triggerResult.raidId}`,
        user: {
          id: "user-1",
        },
        client,
        deferUpdate: async () => {
          deferred = true;
        },
        reply: async (payload: { content: string; ephemeral: boolean }) => {
          replies.push(payload);
        },
      } as never);

      assert.equal(deferred, true);
      assert.deepEqual(replies, []);
      assert.deepEqual(publishedPayloads, [
        {
          content: "<@user-1> Achievement unlocked: raid-join-test.",
          allowedMentions: {
            parse: [],
            users: ["user-1"],
          },
        },
      ]);
    } finally {
      if (runtime) {
        await runtime.stop();
      }

      (
        sharedDb as {
          getDatabase: typeof sharedDb.getDatabase;
        }
      ).getDatabase = originalGetDatabase;
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = originalAwardManualDiceAchievements;
      db.close();
      clearModules(modulePaths);
    }
  });
});

test("raiders can leave during signup and rejoining the same raid does not republish join achievements", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: "achievements-channel" }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../app/discord/achievement-announcements",
      "../../../shared/db",
      "../../progression/application/achievement-awards",
      "./live-runtime",
    ] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    const achievementAwards = moduleRequire(
      "../../progression/application/achievement-awards",
    ) as typeof import("../../progression/application/achievement-awards");
    const originalAwardManualDiceAchievements = achievementAwards.awardManualDiceAchievements;
    let runtime: import("./live-runtime").RaidsLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = () => ["raid-join-test"];

      const { createRaidsLiveRuntime } = moduleRequire(
        "./live-runtime",
      ) as typeof import("./live-runtime");
      const publishedPayloads: Array<{
        content: string;
        allowedMentions: {
          parse: string[];
          users: string[];
        };
      }> = [];
      const announcementEdits: unknown[] = [];
      const announcementMessage = {
        id: "raid-message-1",
        channelId: "raid-channel",
        channel: {
          send: async () => announcementMessage,
        },
        edit: async (payload: unknown) => {
          announcementEdits.push(payload);
          return payload;
        },
      };
      const raidChannel = {
        isTextBased: () => true,
        send: async () => announcementMessage,
      };
      const achievementsChannel = {
        isTextBased: () => true,
        send: async (options: {
          content: string;
          allowedMentions: {
            parse: string[];
            users: string[];
          };
        }) => {
          publishedPayloads.push(options);
          return {} as never;
        },
      };

      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "raid-channel") {
              return raidChannel;
            }

            if (channelId === "achievements-channel") {
              return achievementsChannel;
            }

            return null;
          },
        },
      } as never;

      runtime = createRaidsLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "raid-channel",
          joinLeadMs: 60_000,
          activeDurationMs: 60_000,
          targetRaidsPerDay: 0,
          minGapMs: 1,
          retryDelayMs: 1,
          jitterRatio: 0,
          quietHours: {
            start: "00:00",
            end: "00:00",
            timezone: "UTC",
          },
        },
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      const triggerResult = await runtime.triggerRaidNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live raid to be created.");
      }

      await runtime.handleButtonInteraction({
        customId: `raid-join:${triggerResult.raidId}`,
        user: { id: "user-1" },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      await runtime.handleButtonInteraction({
        customId: `raid-leave:${triggerResult.raidId}`,
        user: { id: "user-1" },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      await runtime.handleButtonInteraction({
        customId: `raid-join:${triggerResult.raidId}`,
        user: { id: "user-1" },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      assert.equal(
        publishedPayloads.filter((payload) => payload.content.includes("raid-join-test")).length,
        1,
      );
      assert.ok(announcementEdits.length >= 3);
    } finally {
      if (runtime) {
        await runtime.stop();
      }

      (
        sharedDb as {
          getDatabase: typeof sharedDb.getDatabase;
        }
      ).getDatabase = originalGetDatabase;
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = originalAwardManualDiceAchievements;
      db.close();
      clearModules(modulePaths);
    }
  });
});

test("resolved raids publish achievement announcements even if the active prompt edit fails", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: "achievements-channel" }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../app/discord/achievement-announcements",
      "../../../shared/db",
      "../../progression/application/achievement-awards",
      "./live-runtime",
    ] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    const achievementAwards = moduleRequire(
      "../../progression/application/achievement-awards",
    ) as typeof import("../../progression/application/achievement-awards");
    const originalAwardManualDiceAchievements = achievementAwards.awardManualDiceAchievements;
    let runtime: import("./live-runtime").RaidsLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = (_progression, _userId, achievementIds) => {
        if (achievementIds.includes("raid-first-clear")) {
          return ["raid-resolve-test"];
        }

        return [];
      };

      const { createRaidsLiveRuntime } = moduleRequire(
        "./live-runtime",
      ) as typeof import("./live-runtime");
      const publishedPayloads: Array<{
        content: string;
        allowedMentions: {
          parse: string[];
          users: string[];
        };
      }> = [];
      const announcementEdits: unknown[] = [];
      let activeEditCalls = 0;
      const activeMessage = {
        id: "active-message-1",
        edit: async (payload: unknown) => {
          activeEditCalls += 1;
          if (activeEditCalls >= 2) {
            throw new Error("resolved active prompt edit failed");
          }

          return payload;
        },
        startThread: async () => ({
          id: "raid-thread-1",
        }),
      };
      const announcementMessage = {
        id: "raid-message-1",
        channelId: "raid-channel",
        channel: {
          send: async () => activeMessage,
        },
        edit: async (payload: unknown) => {
          announcementEdits.push(payload);
          return payload;
        },
      };
      const raidChannel = {
        isTextBased: () => true,
        send: async () => announcementMessage,
      };
      const achievementsChannel = {
        isTextBased: () => true,
        send: async (options: {
          content: string;
          allowedMentions: {
            parse: string[];
            users: string[];
          };
        }) => {
          publishedPayloads.push(options);
          return {} as never;
        },
      };

      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "raid-channel") {
              return raidChannel;
            }

            if (channelId === "achievements-channel") {
              return achievementsChannel;
            }

            return null;
          },
        },
      } as never;

      runtime = createRaidsLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "raid-channel",
          joinLeadMs: 10,
          activeDurationMs: 60_000,
          targetRaidsPerDay: 0,
          minGapMs: 1,
          retryDelayMs: 1,
          jitterRatio: 0,
          quietHours: {
            start: "00:00",
            end: "00:00",
            timezone: "UTC",
          },
        },
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      const triggerResult = await runtime.triggerRaidNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live raid to be created.");
      }

      await runtime.handleButtonInteraction({
        customId: `raid-join:${triggerResult.raidId}`,
        user: {
          id: "user-1",
        },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      publishedPayloads.length = 0;

      await new Promise((resolve) => setTimeout(resolve, 30));

      const result = runtime.applyDiceRoll({
        channelId: "raid-thread-1",
        userId: "user-1",
        userMention: "<@user-1>",
        damage: 1_000_000,
      });

      assert.equal(result.kind, "applied");
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.deepEqual(publishedPayloads, [
        {
          content: "<@user-1> Achievement unlocked: raid-resolve-test.",
          allowedMentions: {
            parse: [],
            users: ["user-1"],
          },
        },
      ]);
      assert.ok(announcementEdits.length >= 2);
    } finally {
      if (runtime) {
        await runtime.stop();
      }

      (
        sharedDb as {
          getDatabase: typeof sharedDb.getDatabase;
        }
      ).getDatabase = originalGetDatabase;
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = originalAwardManualDiceAchievements;
      db.close();
      clearModules(modulePaths);
    }
  });
});
