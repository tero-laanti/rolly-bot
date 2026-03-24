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
