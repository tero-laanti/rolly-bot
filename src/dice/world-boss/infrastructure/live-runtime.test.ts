import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../shared/db/schema";
import { truncateDiscordText } from "../../../shared/discord";

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

test("active World Boss thread names are truncated to Discord limits", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: undefined }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../shared/db",
      "../domain/raid",
      "./live-runtime",
    ] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    const raidDomain = moduleRequire("../domain/raid") as typeof import("../domain/raid");
    const originalCreateWorldBoss = raidDomain.createWorldBoss;
    let runtime: import("./live-runtime").WorldBossLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;

      const longBossName = "Ancient Guardian ".repeat(10).trim();
      (
        raidDomain as {
          createWorldBoss: typeof raidDomain.createWorldBoss;
        }
      ).createWorldBoss = () => ({
        name: longBossName,
        level: 99,
        maxHp: 9999,
        reward: {
          pips: 20,
          rollPassMultiplier: 8,
          rollPassRolls: 5,
        },
      });

      const startedThreadNames: string[] = [];
      const activeMessage = {
        id: "active-message-1",
        edit: async (payload: unknown) => payload,
        startThread: async (options: { name: string; autoArchiveDuration: number }) => {
          startedThreadNames.push(options.name);
          return {
            id: "world-boss-thread-1",
          };
        },
      };
      const announcementMessage = {
        id: "world-boss-message-1",
        channelId: "world-boss-channel",
        channel: {
          send: async () => activeMessage,
        },
        edit: async (payload: unknown) => payload,
      };
      const raidChannel = {
        isTextBased: () => true,
        send: async () => announcementMessage,
      };
      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "world-boss-channel") {
              return raidChannel;
            }

            return null;
          },
        },
      } as never;

      const { createWorldBossLiveRuntime } = moduleRequire(
        "./live-runtime",
      ) as typeof import("./live-runtime");
      const raidRuntime = createWorldBossLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "world-boss-channel",
          joinLeadMs: 50,
          activeDurationMs: 60_000,
          targetWorldBossesPerDay: 0,
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
      runtime = raidRuntime;

      const triggerResult = await raidRuntime.triggerWorldBossNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live World Boss to be created.");
      }

      await raidRuntime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
        user: {
          id: "user-1",
        },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      for (let attempt = 0; attempt < 10 && startedThreadNames.length < 1; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      assert.equal(startedThreadNames.length, 1);
      assert.equal(startedThreadNames[0], truncateDiscordText(`${longBossName} World Boss`, 100));
      assert.ok(startedThreadNames[0].length <= 100);
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
        raidDomain as {
          createWorldBoss: typeof raidDomain.createWorldBoss;
        }
      ).createWorldBoss = originalCreateWorldBoss;
      db.close();
      clearModules(modulePaths);
    }
  });
});

test("World Boss join publishes achievement announcements even if the signup prompt edit fails", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: "achievements-channel" }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../app/discord/achievement-effects",
      "../../../app/discord/achievement-announcements",
      "../../../app/discord/contract-completion-announcements",
      "../../../shared/db",
      "../../contracts/infrastructure/sqlite/services",
      "../../progression/application/achievement-awards",
      "./live-runtime",
    ] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    const contractsServices = moduleRequire(
      "../../contracts/infrastructure/sqlite/services",
    ) as typeof import("../../contracts/infrastructure/sqlite/services");
    const originalCreateSqliteContractsGameplayProgressPort =
      contractsServices.createSqliteContractsGameplayProgressPort;
    const contractAnnouncements = moduleRequire(
      "../../../app/discord/contract-completion-announcements",
    ) as typeof import("../../../app/discord/contract-completion-announcements");
    const originalPublishContractCompletionAnnouncements =
      contractAnnouncements.publishContractCompletionAnnouncements;
    const achievementAwards = moduleRequire(
      "../../progression/application/achievement-awards",
    ) as typeof import("../../progression/application/achievement-awards");
    const originalAwardManualDiceAchievements = achievementAwards.awardManualDiceAchievements;
    let runtime: import("./live-runtime").WorldBossLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
      (
        contractsServices as {
          createSqliteContractsGameplayProgressPort: typeof contractsServices.createSqliteContractsGameplayProgressPort;
        }
      ).createSqliteContractsGameplayProgressPort = () => ({
        recordRoll: () => null,
        recordPvpWin: () => null,
        recordCasinoGameCompletion: () => null,
        recordWorldBossJoin: ({ userId }) => ({
          updates: [],
          contractCompletionAnnouncements: [
            {
              userId,
              cadence: "weekly",
              contractTitle: "World Boss Detail",
              rewardPips: 45,
            },
          ],
        }),
      });
      const publishedContractAnnouncements: Array<{
        userId: string;
        cadence: "daily" | "weekly";
        contractTitle: string;
        rewardPips: number;
      }> = [];
      (
        contractAnnouncements as {
          publishContractCompletionAnnouncements: typeof contractAnnouncements.publishContractCompletionAnnouncements;
        }
      ).publishContractCompletionAnnouncements = async ({ announcements }) => {
        publishedContractAnnouncements.push(...announcements);
      };
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = () => ["world-boss-join-test"];

      const { createWorldBossLiveRuntime } = moduleRequire(
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
        id: "world-boss-message-1",
        channelId: "world-boss-channel",
        channel: raidChannel,
        edit: async () => {
          throw new Error("prompt edit failed");
        },
      };

      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "world-boss-channel") {
              return raidChannel;
            }

            if (channelId === "achievements-channel") {
              return achievementsChannel;
            }

            return null;
          },
        },
      } as never;

      runtime = createWorldBossLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "world-boss-channel",
          joinLeadMs: 60_000,
          activeDurationMs: 60_000,
          targetWorldBossesPerDay: 0,
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

      const triggerResult = await runtime.triggerWorldBossNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live World Boss to be created.");
      }

      let deferred = false;
      const replies: Array<{ content: string; ephemeral: boolean }> = [];
      await runtime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
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
          content: "<@user-1> Achievement unlocked: world-boss-join-test.",
          allowedMentions: {
            parse: [],
            users: ["user-1"],
          },
        },
      ]);
      assert.deepEqual(publishedContractAnnouncements, [
        {
          userId: "user-1",
          cadence: "weekly",
          contractTitle: "World Boss Detail",
          rewardPips: 45,
        },
      ]);
    } finally {
      if (runtime) {
        await runtime.stop();
      }

      (
        contractsServices as {
          createSqliteContractsGameplayProgressPort: typeof contractsServices.createSqliteContractsGameplayProgressPort;
        }
      ).createSqliteContractsGameplayProgressPort =
        originalCreateSqliteContractsGameplayProgressPort;
      (
        contractAnnouncements as {
          publishContractCompletionAnnouncements: typeof contractAnnouncements.publishContractCompletionAnnouncements;
        }
      ).publishContractCompletionAnnouncements = originalPublishContractCompletionAnnouncements;
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

test("World Boss join still succeeds when contract progress recording fails", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: undefined }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../shared/db",
      "../../contracts/infrastructure/sqlite/services",
      "./live-runtime",
    ] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    const contractsServices = moduleRequire(
      "../../contracts/infrastructure/sqlite/services",
    ) as typeof import("../../contracts/infrastructure/sqlite/services");
    const originalCreateSqliteContractsGameplayProgressPort =
      contractsServices.createSqliteContractsGameplayProgressPort;
    let runtime: import("./live-runtime").WorldBossLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
      (
        contractsServices as {
          createSqliteContractsGameplayProgressPort: typeof contractsServices.createSqliteContractsGameplayProgressPort;
        }
      ).createSqliteContractsGameplayProgressPort = () => ({
        recordRoll: () => null,
        recordPvpWin: () => null,
        recordCasinoGameCompletion: () => null,
        recordWorldBossJoin: () => {
          throw new Error("contracts unavailable");
        },
      });

      const warnings: unknown[][] = [];
      const announcementMessage = {
        id: "world-boss-message-1",
        channelId: "world-boss-channel",
        channel: {
          send: async () => announcementMessage,
        },
        edit: async (payload: unknown) => payload,
      };
      const raidChannel = {
        isTextBased: () => true,
        send: async () => announcementMessage,
      };
      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "world-boss-channel") {
              return raidChannel;
            }

            return null;
          },
        },
      } as never;

      const { createWorldBossLiveRuntime } = moduleRequire(
        "./live-runtime",
      ) as typeof import("./live-runtime");
      runtime = createWorldBossLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "world-boss-channel",
          joinLeadMs: 60_000,
          activeDurationMs: 60_000,
          targetWorldBossesPerDay: 0,
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
          warn: (...args: unknown[]) => {
            warnings.push(args);
          },
          error: () => undefined,
        },
      });

      const triggerResult = await runtime.triggerWorldBossNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live World Boss to be created.");
      }

      await runtime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
        user: {
          id: "user-1",
        },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      const snapshot = runtime.getLiveWorldBossesSnapshot();
      assert.equal(snapshot.length, 1);
      assert.equal(snapshot[0]?.participantCount, 1);
      assert.equal(warnings.length, 1);
      assert.match(String(warnings[0]?.[0]), /Failed to record World Boss join progress/);
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
        contractsServices as {
          createSqliteContractsGameplayProgressPort: typeof contractsServices.createSqliteContractsGameplayProgressPort;
        }
      ).createSqliteContractsGameplayProgressPort =
        originalCreateSqliteContractsGameplayProgressPort;
      db.close();
      clearModules(modulePaths);
    }
  });
});

test("World Boss join still succeeds when contracts are disabled at runtime wiring", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: undefined }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../shared/db",
      "../../contracts/infrastructure/sqlite/services",
      "./live-runtime",
    ] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    const contractsServices = moduleRequire(
      "../../contracts/infrastructure/sqlite/services",
    ) as typeof import("../../contracts/infrastructure/sqlite/services");
    const originalCreateSqliteContractsGameplayProgressPort =
      contractsServices.createSqliteContractsGameplayProgressPort;
    let runtime: import("./live-runtime").WorldBossLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
      (
        contractsServices as {
          createSqliteContractsGameplayProgressPort: typeof contractsServices.createSqliteContractsGameplayProgressPort;
        }
      ).createSqliteContractsGameplayProgressPort = () => undefined;

      const warnings: unknown[][] = [];
      const announcementMessage = {
        id: "world-boss-message-1",
        channelId: "world-boss-channel",
        channel: {
          send: async () => announcementMessage,
        },
        edit: async (payload: unknown) => payload,
      };
      const raidChannel = {
        isTextBased: () => true,
        send: async () => announcementMessage,
      };
      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "world-boss-channel") {
              return raidChannel;
            }

            return null;
          },
        },
      } as never;

      const { createWorldBossLiveRuntime } = moduleRequire(
        "./live-runtime",
      ) as typeof import("./live-runtime");
      runtime = createWorldBossLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "world-boss-channel",
          joinLeadMs: 60_000,
          activeDurationMs: 60_000,
          targetWorldBossesPerDay: 0,
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
          warn: (...args: unknown[]) => {
            warnings.push(args);
          },
          error: () => undefined,
        },
      });

      const triggerResult = await runtime.triggerWorldBossNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live World Boss to be created.");
      }

      await runtime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
        user: {
          id: "user-1",
        },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      const snapshot = runtime.getLiveWorldBossesSnapshot();
      assert.equal(snapshot.length, 1);
      assert.equal(snapshot[0]?.participantCount, 1);
      assert.equal(warnings.length, 0);
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
        contractsServices as {
          createSqliteContractsGameplayProgressPort: typeof contractsServices.createSqliteContractsGameplayProgressPort;
        }
      ).createSqliteContractsGameplayProgressPort =
        originalCreateSqliteContractsGameplayProgressPort;
      db.close();
      clearModules(modulePaths);
    }
  });
});

test("players can leave during signup and rejoining the same World Boss does not republish join achievements", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: "achievements-channel" }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../app/discord/achievement-effects",
      "../../../app/discord/achievement-announcements",
      "../../../app/discord/contract-completion-announcements",
      "../../../shared/db",
      "../../contracts/infrastructure/sqlite/services",
      "../../progression/application/achievement-awards",
      "./live-runtime",
    ] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    const contractsServices = moduleRequire(
      "../../contracts/infrastructure/sqlite/services",
    ) as typeof import("../../contracts/infrastructure/sqlite/services");
    const originalCreateSqliteContractsGameplayProgressPort =
      contractsServices.createSqliteContractsGameplayProgressPort;
    const contractAnnouncements = moduleRequire(
      "../../../app/discord/contract-completion-announcements",
    ) as typeof import("../../../app/discord/contract-completion-announcements");
    const originalPublishContractCompletionAnnouncements =
      contractAnnouncements.publishContractCompletionAnnouncements;
    const achievementAwards = moduleRequire(
      "../../progression/application/achievement-awards",
    ) as typeof import("../../progression/application/achievement-awards");
    const originalAwardManualDiceAchievements = achievementAwards.awardManualDiceAchievements;
    let runtime: import("./live-runtime").WorldBossLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = () => ["world-boss-join-test"];
      const recordedWorldBossJoins: string[] = [];
      (
        contractsServices as {
          createSqliteContractsGameplayProgressPort: typeof contractsServices.createSqliteContractsGameplayProgressPort;
        }
      ).createSqliteContractsGameplayProgressPort = () => ({
        recordRoll: () => null,
        recordPvpWin: () => null,
        recordCasinoGameCompletion: () => null,
        recordWorldBossJoin: ({ userId }) => {
          recordedWorldBossJoins.push(userId);
          return {
            updates: [],
            contractCompletionAnnouncements: [
              {
                userId,
                cadence: "weekly",
                contractTitle: "World Boss Detail",
                rewardPips: 45,
              },
            ],
          };
        },
      });
      const publishedContractAnnouncements: Array<{
        userId: string;
        cadence: "daily" | "weekly";
        contractTitle: string;
        rewardPips: number;
      }> = [];
      (
        contractAnnouncements as {
          publishContractCompletionAnnouncements: typeof contractAnnouncements.publishContractCompletionAnnouncements;
        }
      ).publishContractCompletionAnnouncements = async ({ announcements }) => {
        publishedContractAnnouncements.push(...announcements);
      };

      const { createWorldBossLiveRuntime } = moduleRequire(
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
        id: "world-boss-message-1",
        channelId: "world-boss-channel",
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
            if (channelId === "world-boss-channel") {
              return raidChannel;
            }

            if (channelId === "achievements-channel") {
              return achievementsChannel;
            }

            return null;
          },
        },
      } as never;

      runtime = createWorldBossLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "world-boss-channel",
          joinLeadMs: 60_000,
          activeDurationMs: 60_000,
          targetWorldBossesPerDay: 0,
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

      const triggerResult = await runtime.triggerWorldBossNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live World Boss to be created.");
      }

      await runtime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
        user: { id: "user-1" },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      await runtime.handleButtonInteraction({
        customId: `world-boss-leave:${triggerResult.worldBossId}`,
        user: { id: "user-1" },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      await runtime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
        user: { id: "user-1" },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      assert.equal(
        publishedPayloads.filter((payload) => payload.content.includes("world-boss-join-test"))
          .length,
        1,
      );
      assert.equal(
        publishedContractAnnouncements.filter(
          (announcement) => announcement.contractTitle === "World Boss Detail",
        ).length,
        1,
      );
      assert.deepEqual(recordedWorldBossJoins, ["user-1"]);
      assert.ok(announcementEdits.length >= 3);
    } finally {
      if (runtime) {
        await runtime.stop();
      }

      (
        contractsServices as {
          createSqliteContractsGameplayProgressPort: typeof contractsServices.createSqliteContractsGameplayProgressPort;
        }
      ).createSqliteContractsGameplayProgressPort =
        originalCreateSqliteContractsGameplayProgressPort;
      (
        contractAnnouncements as {
          publishContractCompletionAnnouncements: typeof contractAnnouncements.publishContractCompletionAnnouncements;
        }
      ).publishContractCompletionAnnouncements = originalPublishContractCompletionAnnouncements;
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

test("resolved World Boss fights publish achievement announcements even if the active prompt edit fails", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: "achievements-channel" }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../app/discord/achievement-effects",
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
    let runtime: import("./live-runtime").WorldBossLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
      (
        achievementAwards as {
          awardManualDiceAchievements: typeof achievementAwards.awardManualDiceAchievements;
        }
      ).awardManualDiceAchievements = (_progression, _userId, achievementIds) => {
        if (achievementIds.includes("world-boss-first-clear")) {
          return ["world-boss-resolve-test"];
        }

        return [];
      };

      const { createWorldBossLiveRuntime } = moduleRequire(
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
          id: "world-boss-thread-1",
        }),
      };
      const announcementMessage = {
        id: "world-boss-message-1",
        channelId: "world-boss-channel",
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
            if (channelId === "world-boss-channel") {
              return raidChannel;
            }

            if (channelId === "achievements-channel") {
              return achievementsChannel;
            }

            return null;
          },
        },
      } as never;

      runtime = createWorldBossLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "world-boss-channel",
          joinLeadMs: 10,
          activeDurationMs: 60_000,
          targetWorldBossesPerDay: 0,
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

      const triggerResult = await runtime.triggerWorldBossNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live World Boss to be created.");
      }

      await runtime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
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
        channelId: "world-boss-thread-1",
        userId: "user-1",
        userMention: "<@user-1>",
        damage: 1_000_000,
      });

      assert.equal(result.kind, "applied");
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.deepEqual(publishedPayloads, [
        {
          content: "<@user-1> Achievement unlocked: world-boss-resolve-test.",
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

test("successful World Boss clears create a restart-safe Roll Paradise channel", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: undefined }, async () => {
    const modulePaths = ["../../../shared/config", "../../../shared/db", "./live-runtime"] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;

    let runtime: import("./live-runtime").WorldBossLiveRuntime | null = null;
    let recoveredRuntime: import("./live-runtime").WorldBossLiveRuntime | null = null;
    let expiryRuntime: import("./live-runtime").WorldBossLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;

      const createdRushChannels: unknown[] = [];
      const rushKickoffPayloads: unknown[] = [];
      const rushDeleteCalls: number[] = [];
      const announcementEdits: unknown[] = [];
      const activeEdits: unknown[] = [];
      const inheritedPermissionOverwrites = [
        {
          id: "everyone-role",
          allow: { bitfield: 0n },
          deny: { bitfield: 1024n },
          type: 0,
        },
        {
          id: "bot-user-1",
          allow: { bitfield: 2048n },
          deny: { bitfield: 0n },
          type: 1,
        },
      ];

      const rushChannel = {
        id: "roll-paradise-channel-1",
        send: async (payload: unknown) => {
          rushKickoffPayloads.push(payload);
          return {
            id: "roll-paradise-kickoff-1",
          };
        },
        delete: async () => {
          rushDeleteCalls.push(Date.now());
          return rushChannel;
        },
      };
      const activeMessage = {
        id: "active-message-1",
        edit: async (payload: unknown) => {
          activeEdits.push(payload);
          return payload;
        },
        startThread: async () => ({
          id: "world-boss-thread-1",
        }),
      };
      const announcementMessage = {
        id: "world-boss-message-1",
        channelId: "world-boss-channel",
        channel: {
          send: async () => activeMessage,
        },
        edit: async (payload: unknown) => {
          announcementEdits.push(payload);
          return payload;
        },
      };
      const worldBossChannel = {
        isTextBased: () => true,
        parentId: "world-boss-category-1",
        permissionOverwrites: {
          cache: inheritedPermissionOverwrites,
        },
        guild: {
          channels: {
            create: async (options: unknown) => {
              createdRushChannels.push(options);
              return rushChannel;
            },
          },
        },
        send: async () => announcementMessage,
      };
      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "world-boss-channel") {
              return worldBossChannel;
            }

            if (channelId === "roll-paradise-channel-1") {
              return rushChannel;
            }

            return null;
          },
        },
      } as never;

      const { createWorldBossLiveRuntime } = moduleRequire(
        "./live-runtime",
      ) as typeof import("./live-runtime");

      const runtimeConfig = {
        enabled: true,
        inactiveReason: null,
        channelId: "world-boss-channel",
        joinLeadMs: 10,
        activeDurationMs: 60_000,
        targetWorldBossesPerDay: 0,
        minGapMs: 1,
        retryDelayMs: 1,
        jitterRatio: 0,
        quietHours: {
          start: "00:00",
          end: "00:00",
          timezone: "UTC",
        },
      };

      runtime = createWorldBossLiveRuntime({
        client,
        config: runtimeConfig,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      const triggerResult = await runtime.triggerWorldBossNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live World Boss to be created.");
      }

      await runtime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
        user: {
          id: "user-1",
        },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      await new Promise((resolve) => setTimeout(resolve, 30));

      const result = runtime.applyDiceRoll({
        channelId: "world-boss-thread-1",
        userId: "user-1",
        userMention: "<@user-1>",
        damage: 1_000_000,
      });
      assert.equal(result.kind, "applied");

      await new Promise((resolve) => setTimeout(resolve, 30));

      const activeStatus = runtime.getActiveDoubleRollRushStatus({
        channelId: "roll-paradise-channel-1",
      });
      assert.deepEqual(activeStatus, {
        isActive: true,
        expiresAtMs: activeStatus.expiresAtMs,
      });
      assert.equal(createdRushChannels.length, 1);
      const createdRushChannel = createdRushChannels[0] as {
        name?: string;
        permissionOverwrites?: Array<{
          id: string;
        }>;
      };
      assert.equal(createdRushChannel.name, "roll-paradise");
      assert.deepEqual(
        createdRushChannel.permissionOverwrites?.map((overwrite) => overwrite.id),
        ["everyone-role", "bot-user-1"],
      );
      assert.equal(rushKickoffPayloads.length, 1);
      assert.match(
        JSON.stringify(rushKickoffPayloads[0]),
        /@here, the .* has fallen! The roll paradise is briefly open!/,
      );
      assert.match(JSON.stringify(rushKickoffPayloads[0]), /Roll Paradise/);
      assert.match(JSON.stringify(announcementEdits), /Roll Paradise is live/);
      assert.match(JSON.stringify(activeEdits), /Roll Paradise is live/);

      await runtime.stop();
      runtime = null;

      recoveredRuntime = createWorldBossLiveRuntime({
        client,
        config: runtimeConfig,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      const recoverySummary = await recoveredRuntime.recoverDoubleRollRushesOnStartup({
        now: new Date((activeStatus.expiresAtMs ?? Date.now()) - 60_000),
      });
      assert.deepEqual(recoverySummary, {
        resumedCount: 1,
        expiredCount: 0,
        invalidCount: 0,
      });
      assert.deepEqual(
        recoveredRuntime.getActiveDoubleRollRushStatus({
          channelId: "roll-paradise-channel-1",
          nowMs: (activeStatus.expiresAtMs ?? Date.now()) - 60_000,
        }),
        {
          isActive: true,
          expiresAtMs: activeStatus.expiresAtMs,
        },
      );

      await recoveredRuntime.stop();
      recoveredRuntime = null;

      expiryRuntime = createWorldBossLiveRuntime({
        client,
        config: runtimeConfig,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });

      const expirySummary = await expiryRuntime.recoverDoubleRollRushesOnStartup({
        now: new Date((activeStatus.expiresAtMs ?? Date.now()) + 60_000),
      });
      assert.deepEqual(expirySummary, {
        resumedCount: 0,
        expiredCount: 1,
        invalidCount: 0,
      });
      assert.deepEqual(
        expiryRuntime.getActiveDoubleRollRushStatus({
          channelId: "roll-paradise-channel-1",
          nowMs: (activeStatus.expiresAtMs ?? Date.now()) + 60_000,
        }),
        {
          isActive: false,
          expiresAtMs: null,
        },
      );
      assert.equal(rushDeleteCalls.length, 1);
    } finally {
      if (runtime) {
        await runtime.stop();
      }
      if (recoveredRuntime) {
        await recoveredRuntime.stop();
      }
      if (expiryRuntime) {
        await expiryRuntime.stop();
      }

      (
        sharedDb as {
          getDatabase: typeof sharedDb.getDatabase;
        }
      ).getDatabase = originalGetDatabase;
      db.close();
      clearModules(modulePaths);
    }
  });
});

test("Roll Paradise falls back to a non-pinging kickoff message when @here is not allowed", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: undefined }, async () => {
    const modulePaths = ["../../../shared/config", "../../../shared/db", "./live-runtime"] as const;
    clearModules(modulePaths);

    const db = new Database(":memory:");
    initializeDatabaseSchema(db as never);

    const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
    const originalGetDatabase = sharedDb.getDatabase;
    let runtime: import("./live-runtime").WorldBossLiveRuntime | null = null;

    try {
      (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;

      const rushKickoffPayloads: unknown[] = [];
      let kickoffAttempt = 0;
      const rushChannel = {
        id: "roll-paradise-channel-1",
        send: async (payload: { allowedMentions?: { parse?: readonly string[] } }) => {
          rushKickoffPayloads.push(payload);
          kickoffAttempt += 1;
          if (kickoffAttempt === 1) {
            throw new Error("Missing MentionEveryone permission");
          }

          return {
            id: "roll-paradise-kickoff-1",
          };
        },
        delete: async () => rushChannel,
      };
      const activeMessage = {
        id: "active-message-1",
        edit: async (payload: unknown) => payload,
        startThread: async () => ({
          id: "world-boss-thread-1",
        }),
      };
      const announcementMessage = {
        id: "world-boss-message-1",
        channelId: "world-boss-channel",
        channel: {
          send: async () => activeMessage,
        },
        edit: async (payload: unknown) => payload,
      };
      const worldBossChannel = {
        isTextBased: () => true,
        guild: {
          channels: {
            create: async () => rushChannel,
          },
        },
        send: async () => announcementMessage,
      };
      const client = {
        channels: {
          fetch: async (channelId: string) => {
            if (channelId === "world-boss-channel") {
              return worldBossChannel;
            }

            if (channelId === "roll-paradise-channel-1") {
              return rushChannel;
            }

            return null;
          },
        },
      } as never;

      const { createWorldBossLiveRuntime } = moduleRequire(
        "./live-runtime",
      ) as typeof import("./live-runtime");

      runtime = createWorldBossLiveRuntime({
        client,
        config: {
          enabled: true,
          inactiveReason: null,
          channelId: "world-boss-channel",
          joinLeadMs: 10,
          activeDurationMs: 60_000,
          targetWorldBossesPerDay: 0,
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

      const triggerResult = await runtime.triggerWorldBossNow();
      assert.equal(triggerResult.created, true);
      if (!triggerResult.created) {
        throw new Error("Expected live World Boss to be created.");
      }

      await runtime.handleButtonInteraction({
        customId: `world-boss-join:${triggerResult.worldBossId}`,
        user: {
          id: "user-1",
        },
        client,
        deferUpdate: async () => undefined,
        reply: async () => undefined,
      } as never);

      await new Promise((resolve) => setTimeout(resolve, 30));

      const result = runtime.applyDiceRoll({
        channelId: "world-boss-thread-1",
        userId: "user-1",
        userMention: "<@user-1>",
        damage: 1_000_000,
      });
      assert.equal(result.kind, "applied");

      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.equal(rushKickoffPayloads.length, 2);
      assert.match(JSON.stringify(rushKickoffPayloads[0]), /"parse":\["everyone"\]/);
      assert.match(JSON.stringify(rushKickoffPayloads[1]), /"parse":\[\]/);
    } finally {
      if (runtime) {
        await runtime.stop();
      }

      (
        sharedDb as {
          getDatabase: typeof sharedDb.getDatabase;
        }
      ).getDatabase = originalGetDatabase;
      db.close();
      clearModules(modulePaths);
    }
  });
});
