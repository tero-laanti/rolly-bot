import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../shared/db/schema";
import { createSqliteEconomyRepository } from "../../economy/infrastructure/sqlite/balance-repository";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";
import { createSqliteRaidRunRepository } from "./sqlite/raid-run-repository";

const moduleRequire = createRequire(__filename);

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

const stubBoss = {
  bossId: "bone-drake",
  tierId: "bronze",
  name: "Bone Drake",
  level: 8,
  maxHp: 160,
  reward: {
    pips: 6,
    rollPassMultiplier: 2,
    rollPassRolls: 1,
  },
  copy: {
    recruitmentSummary: "A brittle drake circles the ruined tower.",
    encounterTitle: "Bone Drake",
    successSummary: "The Bone Drake collapses.",
    failureSummary: "The Bone Drake escapes.",
  },
} as const;

const stubSilverRoleId = "1487870169392087252";
const stubSilverBoss = {
  ...stubBoss,
  bossId: "storm-warden",
  tierId: "silver",
  name: "Storm Warden",
} as const;

const stubGoldBoss = {
  ...stubBoss,
  bossId: "sun-eater",
  tierId: "gold",
  name: "Sun Eater",
} as const;

const stubTiers = [
  {
    tierId: "bronze",
    name: "Bronze Raids",
    summary: "Entry raids.",
    roleReward: {
      roleRewardId: stubSilverRoleId,
      unlockAnnouncementText:
        "Congratulations on clearing your first Bronze raid. You have now unlocked the next raid tier!",
    },
    bosses: [stubBoss],
  },
  {
    tierId: "silver",
    name: "Silver Raids",
    summary: "Mid raids.",
    roleReward: {
      roleRewardId: "example-silver-raider-role",
      unlockAnnouncementText:
        "Congratulations on clearing your first Silver raid. You have now unlocked the next raid tier!",
    },
    bosses: [stubSilverBoss],
  },
  {
    tierId: "gold",
    name: "Gold Raids",
    summary: "Top raids.",
    bosses: [stubGoldBoss],
  },
] as const;

const stubCatalogReader = {
  listRaidTiers: () => stubTiers,
  getRaidTier: (tierId: string) => stubTiers.find((tier) => tier.tierId === tierId) ?? null,
  getRaidBoss: (bossId: string) => {
    if (bossId === stubBoss.bossId) {
      return stubBoss;
    }

    if (bossId === stubSilverBoss.bossId) {
      return stubSilverBoss;
    }

    if (bossId === stubGoldBoss.bossId) {
      return stubGoldBoss;
    }

    return null;
  },
  getRaidCopy: () => ({
    panelTitle: "Rolly Raids",
    panelDescription: "Pick a tier.",
    startRaidButtonLabel: "Start Raid",
    joinRaidButtonLabel: "Join Raid",
    leaveRaidButtonLabel: "Leave Raid",
    startEncounterButtonLabel: "Start Encounter",
    cancelRaidButtonLabel: "Cancel Raid",
  }),
};

const baseConfig = {
  enabled: true,
  inactiveReason: null,
  instanceCategoryId: "category-1",
  tierBindings: {
    bronze: {
      panelChannelId: "panel-channel",
      accessRoleId: "unused-bronze-role",
    },
    silver: {
      panelChannelId: "silver-panel-channel",
      accessRoleId: "unused-silver-role",
    },
    gold: {
      panelChannelId: "gold-panel-channel",
      accessRoleId: "unused-gold-role",
    },
  },
} as const;

test("raids live runtime allows bronze actions without any unlock role", async () => {
  const modulePaths = [
    "../../../shared/db",
    "./catalog-reader",
    "./discord/discord-raid-instance-provisioner",
    "./discord/discord-raid-recovery-inspector",
    "./discord/discord-raid-status-publisher",
    "./live-runtime",
    "./sqlite/raid-run-repository",
    "./sqlite/services",
  ] as const;
  clearModules(modulePaths);

  const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
  const originalGetDatabase = sharedDb.getDatabase;
  const catalogModule = moduleRequire("./catalog-reader") as typeof import("./catalog-reader");
  const originalCreateCatalogReader = catalogModule.createRollyDataRaidCatalogReader;
  const originalAssertBindings = catalogModule.assertConfiguredRaidTierBindings;
  const servicesModule = moduleRequire("./sqlite/services") as typeof import("./sqlite/services");
  const originalCreateManageLobby = servicesModule.createSqliteManageRaidLobbyUseCase;
  const originalCreateRecoverRuns = servicesModule.createSqliteRecoverRaidRunsUseCase;
  const originalCreateExpireRecruitingRuns =
    servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
  const repositoryModule = moduleRequire(
    "./sqlite/raid-run-repository",
  ) as typeof import("./sqlite/raid-run-repository");
  const originalCreateRepository = repositoryModule.createSqliteRaidRunRepository;
  const statusPublisherModule = moduleRequire(
    "./discord/discord-raid-status-publisher",
  ) as typeof import("./discord/discord-raid-status-publisher");
  const originalCreateStatusPublisher = statusPublisherModule.createDiscordRaidStatusPublisher;
  const provisionerModule = moduleRequire(
    "./discord/discord-raid-instance-provisioner",
  ) as typeof import("./discord/discord-raid-instance-provisioner");
  const originalCreateProvisioner = provisionerModule.createDiscordRaidInstanceProvisioner;
  const inspectorModule = moduleRequire(
    "./discord/discord-raid-recovery-inspector",
  ) as typeof import("./discord/discord-raid-recovery-inspector");
  const originalCreateInspector = inspectorModule.createDiscordRaidRecoveryInspector;

  let handleRaidActionCalled = false;
  let repliedPayload: { content: string; ephemeral: boolean } | null = null;
  let runtime: import("./live-runtime").RaidsLiveRuntime | null = null;

  try {
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => ({}) as never;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).createRollyDataRaidCatalogReader = () => stubCatalogReader as never;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).assertConfiguredRaidTierBindings = () => {};
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteManageRaidLobbyUseCase = () =>
      ({
        buildTierPanelView: () => ({
          content: "panel",
          components: [],
        }),
        handleRaidAction: async () => {
          handleRaidActionCalled = true;
          return {
            kind: "reply",
            payload: {
              type: "message",
              content: "bronze reached",
              ephemeral: true,
            },
          };
        },
      }) as never;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteRecoverRaidRunsUseCase = () =>
      (async () => ({
        resumedCount: 0,
        republishedCount: 0,
        expiredCount: 0,
        interruptedCount: 0,
      })) as never;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteExpireRecruitingRaidRunsUseCase = () =>
      (async () => ({
        expiredCount: 0,
        updatedMessageCount: 0,
        updateFailureCount: 0,
      })) as never;
    (
      repositoryModule as {
        createSqliteRaidRunRepository: typeof repositoryModule.createSqliteRaidRunRepository;
      }
    ).createSqliteRaidRunRepository = () =>
      ({
        getRaidRun: () => null,
        getOpenRaidRunByPrivateChannelId: () => null,
        listRaidRunsByStatuses: () => [],
      }) as never;
    (
      statusPublisherModule as {
        createDiscordRaidStatusPublisher: typeof statusPublisherModule.createDiscordRaidStatusPublisher;
      }
    ).createDiscordRaidStatusPublisher = () =>
      ({
        publishRecruitment: async () => ({
          messageId: "message-1",
          url: "https://example.com/message-1",
          deletePublishedMessage: async () => {},
        }),
        publishStatusMessage: async () => ({
          messageId: "message-1",
          deletePublishedMessage: async () => {},
        }),
        updateStatusMessage: async () => {},
      }) as never;
    (
      provisionerModule as {
        createDiscordRaidInstanceProvisioner: typeof provisionerModule.createDiscordRaidInstanceProvisioner;
      }
    ).createDiscordRaidInstanceProvisioner = () =>
      ({
        provisionRaidInstance: async () => ({
          ok: false,
          reason: "not used",
        }),
        cleanupRaidInstance: async () => {},
      }) as never;
    (
      inspectorModule as {
        createDiscordRaidRecoveryInspector: typeof inspectorModule.createDiscordRaidRecoveryInspector;
      }
    ).createDiscordRaidRecoveryInspector = () =>
      ({
        hasPublicStatusMessage: async () => false,
        deletePublicStatusMessage: async () => {},
        inspectProvisionedRunResources: async () => ({
          privateChannelExists: false,
          participantRoleExists: false,
          participantAssignmentsValid: false,
        }),
        cleanupProvisionedRunResources: async () => {},
      }) as never;

    const { createRaidsLiveRuntime } = moduleRequire(
      "./live-runtime",
    ) as typeof import("./live-runtime");

    const interaction = {
      channelId: "panel-channel",
      customId: "raids:choose-boss:bronze:bone-drake",
      guild: {
        members: {
          fetch: async () => ({
            roles: {
              cache: new Map<string, unknown>(),
            },
          }),
        },
      },
      member: {
        roles: {
          cache: new Map<string, unknown>(),
        },
      },
      message: {
        id: "panel-message",
      },
      reply: async (payload: { content: string; ephemeral: boolean }) => {
        repliedPayload = payload;
      },
      update: async () => {
        throw new Error("should not update");
      },
      user: {
        id: "user-1",
      },
    } as never;

    runtime = createRaidsLiveRuntime({
      client: {} as never,
      config: baseConfig,
      logger: console,
    });

    await runtime.handleButtonInteraction(interaction);

    assert.equal(handleRaidActionCalled, true);
    assert.deepEqual(repliedPayload, {
      content: "bronze reached",
      ephemeral: true,
    });
  } finally {
    await runtime?.stop();
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = originalGetDatabase;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).createRollyDataRaidCatalogReader = originalCreateCatalogReader;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).assertConfiguredRaidTierBindings = originalAssertBindings;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteManageRaidLobbyUseCase = originalCreateManageLobby;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteRecoverRaidRunsUseCase = originalCreateRecoverRuns;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteExpireRecruitingRaidRunsUseCase = originalCreateExpireRecruitingRuns;
    (
      repositoryModule as {
        createSqliteRaidRunRepository: typeof repositoryModule.createSqliteRaidRunRepository;
      }
    ).createSqliteRaidRunRepository = originalCreateRepository;
    (
      statusPublisherModule as {
        createDiscordRaidStatusPublisher: typeof statusPublisherModule.createDiscordRaidStatusPublisher;
      }
    ).createDiscordRaidStatusPublisher = originalCreateStatusPublisher;
    (
      provisionerModule as {
        createDiscordRaidInstanceProvisioner: typeof provisionerModule.createDiscordRaidInstanceProvisioner;
      }
    ).createDiscordRaidInstanceProvisioner = originalCreateProvisioner;
    (
      inspectorModule as {
        createDiscordRaidRecoveryInspector: typeof inspectorModule.createDiscordRaidRecoveryInspector;
      }
    ).createDiscordRaidRecoveryInspector = originalCreateInspector;
    clearModules(modulePaths);
  }
});

test("raids live runtime rejects silver actions when the actor lacks the bronze reward role", async () => {
  const modulePaths = [
    "../../../shared/db",
    "./catalog-reader",
    "./discord/discord-raid-instance-provisioner",
    "./discord/discord-raid-recovery-inspector",
    "./discord/discord-raid-status-publisher",
    "./live-runtime",
    "./sqlite/raid-run-repository",
    "./sqlite/services",
  ] as const;
  clearModules(modulePaths);

  const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
  const originalGetDatabase = sharedDb.getDatabase;
  const catalogModule = moduleRequire("./catalog-reader") as typeof import("./catalog-reader");
  const originalCreateCatalogReader = catalogModule.createRollyDataRaidCatalogReader;
  const originalAssertBindings = catalogModule.assertConfiguredRaidTierBindings;
  const servicesModule = moduleRequire("./sqlite/services") as typeof import("./sqlite/services");
  const originalCreateManageLobby = servicesModule.createSqliteManageRaidLobbyUseCase;
  const originalCreateRecoverRuns = servicesModule.createSqliteRecoverRaidRunsUseCase;
  const originalCreateExpireRecruitingRuns =
    servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
  const repositoryModule = moduleRequire(
    "./sqlite/raid-run-repository",
  ) as typeof import("./sqlite/raid-run-repository");
  const originalCreateRepository = repositoryModule.createSqliteRaidRunRepository;
  const statusPublisherModule = moduleRequire(
    "./discord/discord-raid-status-publisher",
  ) as typeof import("./discord/discord-raid-status-publisher");
  const originalCreateStatusPublisher = statusPublisherModule.createDiscordRaidStatusPublisher;
  const provisionerModule = moduleRequire(
    "./discord/discord-raid-instance-provisioner",
  ) as typeof import("./discord/discord-raid-instance-provisioner");
  const originalCreateProvisioner = provisionerModule.createDiscordRaidInstanceProvisioner;
  const inspectorModule = moduleRequire(
    "./discord/discord-raid-recovery-inspector",
  ) as typeof import("./discord/discord-raid-recovery-inspector");
  const originalCreateInspector = inspectorModule.createDiscordRaidRecoveryInspector;

  let handleRaidActionCalled = false;
  let repliedPayload: { content: string; ephemeral: boolean } | null = null;
  let runtime: import("./live-runtime").RaidsLiveRuntime | null = null;

  try {
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => ({}) as never;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).createRollyDataRaidCatalogReader = () => stubCatalogReader as never;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).assertConfiguredRaidTierBindings = () => {};
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteManageRaidLobbyUseCase = () =>
      ({
        buildTierPanelView: () => ({
          content: "panel",
          components: [],
        }),
        handleRaidAction: async () => {
          handleRaidActionCalled = true;
          return {
            kind: "reply",
            payload: {
              type: "message",
              content: "should not be reached",
              ephemeral: true,
            },
          };
        },
      }) as never;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteRecoverRaidRunsUseCase = () =>
      (async () => ({
        resumedCount: 0,
        republishedCount: 0,
        expiredCount: 0,
        interruptedCount: 0,
      })) as never;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteExpireRecruitingRaidRunsUseCase = () =>
      (async () => ({
        expiredCount: 0,
        updatedMessageCount: 0,
        updateFailureCount: 0,
      })) as never;
    (
      repositoryModule as {
        createSqliteRaidRunRepository: typeof repositoryModule.createSqliteRaidRunRepository;
      }
    ).createSqliteRaidRunRepository = () =>
      ({
        getRaidRun: () => null,
        getOpenRaidRunByPrivateChannelId: () => null,
        listRaidRunsByStatuses: () => [],
      }) as never;
    (
      statusPublisherModule as {
        createDiscordRaidStatusPublisher: typeof statusPublisherModule.createDiscordRaidStatusPublisher;
      }
    ).createDiscordRaidStatusPublisher = () =>
      ({
        publishRecruitment: async () => ({
          messageId: "message-1",
          url: "https://example.com/message-1",
          deletePublishedMessage: async () => {},
        }),
        publishStatusMessage: async () => ({
          messageId: "message-1",
          deletePublishedMessage: async () => {},
        }),
        updateStatusMessage: async () => {},
      }) as never;
    (
      provisionerModule as {
        createDiscordRaidInstanceProvisioner: typeof provisionerModule.createDiscordRaidInstanceProvisioner;
      }
    ).createDiscordRaidInstanceProvisioner = () =>
      ({
        provisionRaidInstance: async () => ({
          ok: false,
          reason: "not used",
        }),
        cleanupRaidInstance: async () => {},
      }) as never;
    (
      inspectorModule as {
        createDiscordRaidRecoveryInspector: typeof inspectorModule.createDiscordRaidRecoveryInspector;
      }
    ).createDiscordRaidRecoveryInspector = () =>
      ({
        hasPublicStatusMessage: async () => false,
        deletePublicStatusMessage: async () => {},
        inspectProvisionedRunResources: async () => ({
          privateChannelExists: false,
          participantRoleExists: false,
          participantAssignmentsValid: false,
        }),
        cleanupProvisionedRunResources: async () => {},
      }) as never;

    const { createRaidsLiveRuntime } = moduleRequire(
      "./live-runtime",
    ) as typeof import("./live-runtime");

    const interaction = {
      channelId: "silver-panel-channel",
      customId: "raids:choose-boss:silver:storm-warden",
      guild: {
        members: {
          fetch: async () => ({
            roles: {
              cache: new Map<string, unknown>(),
            },
          }),
        },
      },
      member: {
        roles: {
          cache: new Map<string, unknown>(),
        },
      },
      message: {
        id: "panel-message",
      },
      reply: async (payload: { content: string; ephemeral: boolean }) => {
        repliedPayload = payload;
      },
      update: async () => {
        throw new Error("should not update");
      },
      user: {
        id: "user-1",
      },
    } as never;

    runtime = createRaidsLiveRuntime({
      client: {} as never,
      config: baseConfig,
      logger: console,
    });

    await runtime.handleButtonInteraction(interaction);

    assert.equal(handleRaidActionCalled, false);
    assert.deepEqual(repliedPayload, {
      content: "You must unlock Bronze Raids before accessing this raid tier.",
      ephemeral: true,
    });
  } finally {
    await runtime?.stop();
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = originalGetDatabase;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).createRollyDataRaidCatalogReader = originalCreateCatalogReader;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).assertConfiguredRaidTierBindings = originalAssertBindings;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteManageRaidLobbyUseCase = originalCreateManageLobby;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteRecoverRaidRunsUseCase = originalCreateRecoverRuns;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteExpireRecruitingRaidRunsUseCase = originalCreateExpireRecruitingRuns;
    (
      repositoryModule as {
        createSqliteRaidRunRepository: typeof repositoryModule.createSqliteRaidRunRepository;
      }
    ).createSqliteRaidRunRepository = originalCreateRepository;
    (
      statusPublisherModule as {
        createDiscordRaidStatusPublisher: typeof statusPublisherModule.createDiscordRaidStatusPublisher;
      }
    ).createDiscordRaidStatusPublisher = originalCreateStatusPublisher;
    (
      provisionerModule as {
        createDiscordRaidInstanceProvisioner: typeof provisionerModule.createDiscordRaidInstanceProvisioner;
      }
    ).createDiscordRaidInstanceProvisioner = originalCreateProvisioner;
    (
      inspectorModule as {
        createDiscordRaidRecoveryInspector: typeof inspectorModule.createDiscordRaidRecoveryInspector;
      }
    ).createDiscordRaidRecoveryInspector = originalCreateInspector;
    clearModules(modulePaths);
  }
});

test("successful raid clears grant rewards to all active raiders and update the encounter prompt", async () => {
  const modulePaths = [
    "../../../shared/db",
    "./catalog-reader",
    "./discord/discord-raid-encounter-publisher",
    "./discord/discord-raid-instance-provisioner",
    "./discord/discord-raid-recovery-inspector",
    "./discord/discord-raid-status-publisher",
    "./live-runtime",
    "./sqlite/services",
    "./tier-role-rewards",
  ] as const;
  clearModules(modulePaths);

  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initializeDatabaseSchema(db);

  const repository = createSqliteRaidRunRepository(db);
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const now = new Date("2026-03-31T10:00:00.000Z");

  const created = repository.createRecruitingRaidRun({
    runId: "raid-run-1",
    tierId: "bronze",
    bossId: stubBoss.bossId,
    leaderUserId: "leader-1",
    publicChannelId: "panel-channel",
    recruitmentExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    now,
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    throw new Error("expected raid run creation to succeed");
  }

  const joined = repository.addRaidRunMember({
    runId: "raid-run-1",
    userId: "user-2",
    expectedVersion: created.raidRun.run.version,
    now,
    partySizeLimit: 4,
  });
  assert.equal(joined.ok, true);
  if (!joined.ok) {
    throw new Error("expected raid run join to succeed");
  }

  const activated = repository.updateRaidRun({
    runId: "raid-run-1",
    expectedVersion: joined.raidRun.run.version,
    now,
    status: "active",
    publicMessageId: "public-message-1",
    privateChannelId: "raid-channel-1",
    participantRoleId: "role-1",
    encounterMessageId: "encounter-message-1",
    encounterStartsAt: now,
    encounterExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    bossCurrentHp: 8,
    versionDelta: 1,
  });
  assert.equal(activated.ok, true);

  const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
  const originalGetDatabase = sharedDb.getDatabase;
  const catalogModule = moduleRequire("./catalog-reader") as typeof import("./catalog-reader");
  const originalCreateCatalogReader = catalogModule.createRollyDataRaidCatalogReader;
  const originalAssertBindings = catalogModule.assertConfiguredRaidTierBindings;
  const servicesModule = moduleRequire("./sqlite/services") as typeof import("./sqlite/services");
  const originalCreateManageLobby = servicesModule.createSqliteManageRaidLobbyUseCase;
  const originalCreateRecoverRuns = servicesModule.createSqliteRecoverRaidRunsUseCase;
  const originalCreateExpireRecruitingRuns =
    servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
  const encounterPublisherModule = moduleRequire(
    "./discord/discord-raid-encounter-publisher",
  ) as typeof import("./discord/discord-raid-encounter-publisher");
  const originalCreateEncounterPublisher =
    encounterPublisherModule.createDiscordRaidEncounterPublisher;
  const statusPublisherModule = moduleRequire(
    "./discord/discord-raid-status-publisher",
  ) as typeof import("./discord/discord-raid-status-publisher");
  const originalCreateStatusPublisher = statusPublisherModule.createDiscordRaidStatusPublisher;
  const provisionerModule = moduleRequire(
    "./discord/discord-raid-instance-provisioner",
  ) as typeof import("./discord/discord-raid-instance-provisioner");
  const originalCreateProvisioner = provisionerModule.createDiscordRaidInstanceProvisioner;
  const inspectorModule = moduleRequire(
    "./discord/discord-raid-recovery-inspector",
  ) as typeof import("./discord/discord-raid-recovery-inspector");
  const originalCreateInspector = inspectorModule.createDiscordRaidRecoveryInspector;
  const tierRoleRewardsModule = moduleRequire(
    "./tier-role-rewards",
  ) as typeof import("./tier-role-rewards");
  const originalGrantRaidTierRoleRewards = tierRoleRewardsModule.grantRaidTierRoleRewards;

  const encounterDescriptions: string[] = [];
  let tierRoleRewardGrantCount = 0;
  const channelMessages: string[] = [];
  try {
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).createRollyDataRaidCatalogReader = () => stubCatalogReader as never;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).assertConfiguredRaidTierBindings = () => {};
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteManageRaidLobbyUseCase = () =>
      ({
        buildTierPanelView: () => ({
          content: "panel",
          components: [],
        }),
        handleRaidAction: async () => ({
          kind: "reply",
          payload: {
            type: "message",
            content: "unused",
            ephemeral: true,
          },
        }),
      }) as never;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteRecoverRaidRunsUseCase = () =>
      (async () => ({
        resumedCount: 0,
        republishedCount: 0,
        expiredCount: 0,
        interruptedCount: 0,
      })) as never;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteExpireRecruitingRaidRunsUseCase = () =>
      (async () => ({
        expiredCount: 0,
        updatedMessageCount: 0,
        updateFailureCount: 0,
      })) as never;
    (
      encounterPublisherModule as {
        createDiscordRaidEncounterPublisher: typeof encounterPublisherModule.createDiscordRaidEncounterPublisher;
      }
    ).createDiscordRaidEncounterPublisher = () =>
      ({
        publishEncounterMessage: async () => ({
          messageId: "encounter-message-2",
        }),
        updateEncounterMessage: async ({
          prompt,
        }: {
          prompt: { embeds?: { toJSON: () => { description?: string } }[] };
        }) => {
          encounterDescriptions.push(prompt.embeds?.[0]?.toJSON().description ?? "");
        },
        sendChannelMessage: async ({ content }: { content: string }) => {
          channelMessages.push(content);
        },
      }) as never;
    (
      statusPublisherModule as {
        createDiscordRaidStatusPublisher: typeof statusPublisherModule.createDiscordRaidStatusPublisher;
      }
    ).createDiscordRaidStatusPublisher = () =>
      ({
        publishRecruitment: async () => ({
          messageId: "message-1",
          url: "https://example.com/message-1",
          deletePublishedMessage: async () => {},
        }),
        publishStatusMessage: async () => ({
          messageId: "message-1",
          deletePublishedMessage: async () => {},
        }),
        updateStatusMessage: async () => {},
      }) as never;
    (
      provisionerModule as {
        createDiscordRaidInstanceProvisioner: typeof provisionerModule.createDiscordRaidInstanceProvisioner;
      }
    ).createDiscordRaidInstanceProvisioner = () =>
      ({
        provisionRaidInstance: async () => ({
          ok: false,
          reason: "unused",
        }),
        cleanupRaidInstance: async () => {},
      }) as never;
    (
      inspectorModule as {
        createDiscordRaidRecoveryInspector: typeof inspectorModule.createDiscordRaidRecoveryInspector;
      }
    ).createDiscordRaidRecoveryInspector = () =>
      ({
        hasPublicStatusMessage: async () => true,
        deletePublicStatusMessage: async () => {},
        inspectProvisionedRunResources: async () => ({
          privateChannelExists: true,
          participantRoleExists: true,
          participantAssignmentsValid: true,
        }),
        cleanupProvisionedRunResources: async () => {},
      }) as never;
    (
      tierRoleRewardsModule as {
        grantRaidTierRoleRewards: typeof tierRoleRewardsModule.grantRaidTierRoleRewards;
      }
    ).grantRaidTierRoleRewards = async () => {
      tierRoleRewardGrantCount += 1;
    };

    const { createRaidsLiveRuntime } = moduleRequire(
      "./live-runtime",
    ) as typeof import("./live-runtime");

    const runtime = createRaidsLiveRuntime({
      client: {} as never,
      config: baseConfig,
      logger: console,
    });

    const result = runtime.applyDiceRoll({
      channelId: "raid-channel-1",
      userId: "leader-1",
      userMention: "<@leader-1>",
      damage: 8,
      bestRollSet: [6, 2],
      nowMs: now.getTime(),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(result.kind, "applied");
    if (result.kind !== "applied") {
      throw new Error("expected raid hit to be applied");
    }

    assert.equal(result.defeated, true);
    assert.match(result.summary, /Rewards granted:/);
    assert.equal(economy.getPips("leader-1"), 106);
    assert.equal(economy.getPips("user-2"), 106);
    const resolvedRun = repository.getRaidRun("raid-run-1");
    assert.equal(resolvedRun?.run.status, "resolved");
    assert.match(
      resolvedRun?.run.rewardSummary ?? "",
      /106 pips \(includes first-clear bonus\) and x2 roll buff/i,
    );
    assert.ok(resolvedRun?.run.rewardGrantedAt instanceof Date);

    const leaderEffects = progression.getActiveDiceTemporaryEffects({ userId: "leader-1" });
    const followerEffects = progression.getActiveDiceTemporaryEffects({ userId: "user-2" });
    assert.equal(leaderEffects.length, 1);
    assert.equal(followerEffects.length, 1);
    assert.equal(leaderEffects[0]?.magnitude, 2);
    assert.equal(leaderEffects[0]?.remainingRolls, 1);
    assert.equal(leaderEffects[0]?.source, "raid:raid-run-1");
    assert.ok(
      encounterDescriptions.some((description) =>
        description.includes("Rewards granted: **106 pips"),
      ),
    );
    assert.ok(
      channelMessages.some((content) => content.includes("Raid instance closing in 5 minutes")),
    );

    const secondCreated = repository.createRecruitingRaidRun({
      runId: "raid-run-2",
      tierId: "bronze",
      bossId: stubBoss.bossId,
      leaderUserId: "leader-1",
      publicChannelId: "panel-channel",
      recruitmentExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      now,
    });
    assert.equal(secondCreated.ok, true);
    if (!secondCreated.ok) {
      throw new Error("expected second raid run creation to succeed");
    }

    const secondJoined = repository.addRaidRunMember({
      runId: "raid-run-2",
      userId: "user-2",
      expectedVersion: secondCreated.raidRun.run.version,
      now,
      partySizeLimit: 4,
    });
    assert.equal(secondJoined.ok, true);
    if (!secondJoined.ok) {
      throw new Error("expected second raid run join to succeed");
    }

    const secondActivated = repository.updateRaidRun({
      runId: "raid-run-2",
      expectedVersion: secondJoined.raidRun.run.version,
      now,
      status: "active",
      publicMessageId: "public-message-2",
      privateChannelId: "raid-channel-2",
      participantRoleId: "role-2",
      encounterMessageId: "encounter-message-2b",
      encounterStartsAt: now,
      encounterExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      bossCurrentHp: 8,
      versionDelta: 1,
    });
    assert.equal(secondActivated.ok, true);

    const secondResult = runtime.applyDiceRoll({
      channelId: "raid-channel-2",
      userId: "leader-1",
      userMention: "<@leader-1>",
      damage: 8,
      bestRollSet: [6, 2],
      nowMs: now.getTime(),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(secondResult.kind, "applied");
    if (secondResult.kind !== "applied") {
      throw new Error("expected second raid hit to be applied");
    }

    assert.equal(secondResult.defeated, true);
    assert.equal(economy.getPips("leader-1"), 112);
    assert.equal(economy.getPips("user-2"), 112);
    assert.equal(tierRoleRewardGrantCount, 2);
    const secondResolvedRun = repository.getRaidRun("raid-run-2");
    assert.match(secondResolvedRun?.run.rewardSummary ?? "", /6 pips and x2 roll buff/i);
    assert.doesNotMatch(secondResolvedRun?.run.rewardSummary ?? "", /first-clear bonus/i);
    await runtime.stop();
  } finally {
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = originalGetDatabase;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).createRollyDataRaidCatalogReader = originalCreateCatalogReader;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).assertConfiguredRaidTierBindings = originalAssertBindings;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteManageRaidLobbyUseCase = originalCreateManageLobby;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteRecoverRaidRunsUseCase = originalCreateRecoverRuns;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteExpireRecruitingRaidRunsUseCase = originalCreateExpireRecruitingRuns;
    (
      encounterPublisherModule as {
        createDiscordRaidEncounterPublisher: typeof encounterPublisherModule.createDiscordRaidEncounterPublisher;
      }
    ).createDiscordRaidEncounterPublisher = originalCreateEncounterPublisher;
    (
      statusPublisherModule as {
        createDiscordRaidStatusPublisher: typeof statusPublisherModule.createDiscordRaidStatusPublisher;
      }
    ).createDiscordRaidStatusPublisher = originalCreateStatusPublisher;
    (
      provisionerModule as {
        createDiscordRaidInstanceProvisioner: typeof provisionerModule.createDiscordRaidInstanceProvisioner;
      }
    ).createDiscordRaidInstanceProvisioner = originalCreateProvisioner;
    (
      inspectorModule as {
        createDiscordRaidRecoveryInspector: typeof inspectorModule.createDiscordRaidRecoveryInspector;
      }
    ).createDiscordRaidRecoveryInspector = originalCreateInspector;
    (
      tierRoleRewardsModule as {
        grantRaidTierRoleRewards: typeof tierRoleRewardsModule.grantRaidTierRoleRewards;
      }
    ).grantRaidTierRoleRewards = originalGrantRaidTierRoleRewards;
    db.close();
    clearModules(modulePaths);
  }
});

test("startup recovery settles zero-hp raids exactly once after a restart", async () => {
  const modulePaths = [
    "../../../shared/db",
    "./catalog-reader",
    "./discord/discord-raid-encounter-publisher",
    "./discord/discord-raid-instance-provisioner",
    "./discord/discord-raid-recovery-inspector",
    "./discord/discord-raid-status-publisher",
    "./live-runtime",
    "./sqlite/services",
    "./tier-role-rewards",
  ] as const;
  clearModules(modulePaths);

  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initializeDatabaseSchema(db);

  const repository = createSqliteRaidRunRepository(db);
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const now = new Date("2026-03-31T11:00:00.000Z");

  const created = repository.createRecruitingRaidRun({
    runId: "raid-run-recovery-1",
    tierId: "bronze",
    bossId: stubBoss.bossId,
    leaderUserId: "leader-1",
    publicChannelId: "panel-channel",
    recruitmentExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    now,
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    throw new Error("expected raid run creation to succeed");
  }

  const joined = repository.addRaidRunMember({
    runId: "raid-run-recovery-1",
    userId: "user-2",
    expectedVersion: created.raidRun.run.version,
    now,
    partySizeLimit: 4,
  });
  assert.equal(joined.ok, true);
  if (!joined.ok) {
    throw new Error("expected raid run join to succeed");
  }

  const activeZeroHp = repository.updateRaidRun({
    runId: "raid-run-recovery-1",
    expectedVersion: joined.raidRun.run.version,
    now,
    status: "active",
    publicMessageId: "public-message-1",
    privateChannelId: "raid-channel-1",
    participantRoleId: "role-1",
    encounterMessageId: "encounter-message-1",
    encounterStartsAt: now,
    encounterExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    bossCurrentHp: 0,
    versionDelta: 1,
  });
  assert.equal(activeZeroHp.ok, true);

  const sharedDb = moduleRequire("../../../shared/db") as typeof import("../../../shared/db");
  const originalGetDatabase = sharedDb.getDatabase;
  const catalogModule = moduleRequire("./catalog-reader") as typeof import("./catalog-reader");
  const originalCreateCatalogReader = catalogModule.createRollyDataRaidCatalogReader;
  const originalAssertBindings = catalogModule.assertConfiguredRaidTierBindings;
  const servicesModule = moduleRequire("./sqlite/services") as typeof import("./sqlite/services");
  const originalCreateManageLobby = servicesModule.createSqliteManageRaidLobbyUseCase;
  const originalCreateRecoverRuns = servicesModule.createSqliteRecoverRaidRunsUseCase;
  const originalCreateExpireRecruitingRuns =
    servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
  const encounterPublisherModule = moduleRequire(
    "./discord/discord-raid-encounter-publisher",
  ) as typeof import("./discord/discord-raid-encounter-publisher");
  const originalCreateEncounterPublisher =
    encounterPublisherModule.createDiscordRaidEncounterPublisher;
  const statusPublisherModule = moduleRequire(
    "./discord/discord-raid-status-publisher",
  ) as typeof import("./discord/discord-raid-status-publisher");
  const originalCreateStatusPublisher = statusPublisherModule.createDiscordRaidStatusPublisher;
  const provisionerModule = moduleRequire(
    "./discord/discord-raid-instance-provisioner",
  ) as typeof import("./discord/discord-raid-instance-provisioner");
  const originalCreateProvisioner = provisionerModule.createDiscordRaidInstanceProvisioner;
  const inspectorModule = moduleRequire(
    "./discord/discord-raid-recovery-inspector",
  ) as typeof import("./discord/discord-raid-recovery-inspector");
  const originalCreateInspector = inspectorModule.createDiscordRaidRecoveryInspector;
  const tierRoleRewardsModule = moduleRequire(
    "./tier-role-rewards",
  ) as typeof import("./tier-role-rewards");
  const originalGrantRaidTierRoleRewards = tierRoleRewardsModule.grantRaidTierRoleRewards;

  const encounterDescriptions: string[] = [];
  let tierRoleRewardGrantCount = 0;

  try {
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = () => db as never;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).createRollyDataRaidCatalogReader = () => stubCatalogReader as never;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).assertConfiguredRaidTierBindings = () => {};
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteManageRaidLobbyUseCase = () =>
      ({
        buildTierPanelView: () => ({
          content: "panel",
          components: [],
        }),
        handleRaidAction: async () => ({
          kind: "reply",
          payload: {
            type: "message",
            content: "unused",
            ephemeral: true,
          },
        }),
      }) as never;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteRecoverRaidRunsUseCase = () =>
      (async () => ({
        resumedCount: 0,
        republishedCount: 0,
        expiredCount: 0,
        interruptedCount: 0,
      })) as never;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteExpireRecruitingRaidRunsUseCase = () =>
      (async () => ({
        expiredCount: 0,
        updatedMessageCount: 0,
        updateFailureCount: 0,
      })) as never;
    (
      encounterPublisherModule as {
        createDiscordRaidEncounterPublisher: typeof encounterPublisherModule.createDiscordRaidEncounterPublisher;
      }
    ).createDiscordRaidEncounterPublisher = () =>
      ({
        publishEncounterMessage: async () => ({
          messageId: "encounter-message-2",
        }),
        updateEncounterMessage: async ({
          prompt,
        }: {
          prompt: { embeds?: { toJSON: () => { description?: string } }[] };
        }) => {
          encounterDescriptions.push(prompt.embeds?.[0]?.toJSON().description ?? "");
        },
        sendChannelMessage: async () => {},
      }) as never;
    (
      statusPublisherModule as {
        createDiscordRaidStatusPublisher: typeof statusPublisherModule.createDiscordRaidStatusPublisher;
      }
    ).createDiscordRaidStatusPublisher = () =>
      ({
        publishRecruitment: async () => ({
          messageId: "message-1",
          url: "https://example.com/message-1",
          deletePublishedMessage: async () => {},
        }),
        publishStatusMessage: async () => ({
          messageId: "message-1",
          deletePublishedMessage: async () => {},
        }),
        updateStatusMessage: async () => {},
      }) as never;
    (
      provisionerModule as {
        createDiscordRaidInstanceProvisioner: typeof provisionerModule.createDiscordRaidInstanceProvisioner;
      }
    ).createDiscordRaidInstanceProvisioner = () =>
      ({
        provisionRaidInstance: async () => ({
          ok: false,
          reason: "unused",
        }),
        cleanupRaidInstance: async () => {},
      }) as never;
    (
      inspectorModule as {
        createDiscordRaidRecoveryInspector: typeof inspectorModule.createDiscordRaidRecoveryInspector;
      }
    ).createDiscordRaidRecoveryInspector = () =>
      ({
        hasPublicStatusMessage: async () => true,
        deletePublicStatusMessage: async () => {},
        inspectProvisionedRunResources: async () => ({
          privateChannelExists: true,
          participantRoleExists: true,
          participantAssignmentsValid: true,
        }),
        cleanupProvisionedRunResources: async () => {},
      }) as never;
    (
      tierRoleRewardsModule as {
        grantRaidTierRoleRewards: typeof tierRoleRewardsModule.grantRaidTierRoleRewards;
      }
    ).grantRaidTierRoleRewards = async () => {
      tierRoleRewardGrantCount += 1;
    };

    const { createRaidsLiveRuntime } = moduleRequire(
      "./live-runtime",
    ) as typeof import("./live-runtime");

    const runtime = createRaidsLiveRuntime({
      client: {} as never,
      config: baseConfig,
      logger: console,
    });

    await runtime.recoverRunsOnStartup({ now });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(economy.getPips("leader-1"), 106);
    assert.equal(economy.getPips("user-2"), 106);
    assert.equal(progression.getActiveDiceTemporaryEffects({ userId: "leader-1" }).length, 1);
    assert.equal(progression.getActiveDiceTemporaryEffects({ userId: "user-2" }).length, 1);

    const resolvedRun = repository.getRaidRun("raid-run-recovery-1");
    assert.equal(resolvedRun?.run.status, "resolved");
    assert.equal(resolvedRun?.run.isOpen, false);
    assert.ok(resolvedRun?.run.rewardGrantedAt instanceof Date);
    assert.match(
      resolvedRun?.run.rewardSummary ?? "",
      /106 pips \(includes first-clear bonus\) and x2 roll buff/i,
    );
    assert.equal(tierRoleRewardGrantCount, 1);

    await runtime.recoverRunsOnStartup({ now: new Date(now.getTime() + 30_000) });

    assert.equal(economy.getPips("leader-1"), 106);
    assert.equal(economy.getPips("user-2"), 106);
    assert.equal(tierRoleRewardGrantCount, 2);
    assert.ok(
      encounterDescriptions.some((description) =>
        description.includes("Rewards granted: **106 pips"),
      ),
    );
    await runtime.stop();
  } finally {
    (sharedDb as { getDatabase: typeof sharedDb.getDatabase }).getDatabase = originalGetDatabase;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).createRollyDataRaidCatalogReader = originalCreateCatalogReader;
    (
      catalogModule as {
        createRollyDataRaidCatalogReader: typeof catalogModule.createRollyDataRaidCatalogReader;
        assertConfiguredRaidTierBindings: typeof catalogModule.assertConfiguredRaidTierBindings;
      }
    ).assertConfiguredRaidTierBindings = originalAssertBindings;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteManageRaidLobbyUseCase = originalCreateManageLobby;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteRecoverRaidRunsUseCase = originalCreateRecoverRuns;
    (
      servicesModule as {
        createSqliteManageRaidLobbyUseCase: typeof servicesModule.createSqliteManageRaidLobbyUseCase;
        createSqliteRecoverRaidRunsUseCase: typeof servicesModule.createSqliteRecoverRaidRunsUseCase;
        createSqliteExpireRecruitingRaidRunsUseCase: typeof servicesModule.createSqliteExpireRecruitingRaidRunsUseCase;
      }
    ).createSqliteExpireRecruitingRaidRunsUseCase = originalCreateExpireRecruitingRuns;
    (
      encounterPublisherModule as {
        createDiscordRaidEncounterPublisher: typeof encounterPublisherModule.createDiscordRaidEncounterPublisher;
      }
    ).createDiscordRaidEncounterPublisher = originalCreateEncounterPublisher;
    (
      statusPublisherModule as {
        createDiscordRaidStatusPublisher: typeof statusPublisherModule.createDiscordRaidStatusPublisher;
      }
    ).createDiscordRaidStatusPublisher = originalCreateStatusPublisher;
    (
      provisionerModule as {
        createDiscordRaidInstanceProvisioner: typeof provisionerModule.createDiscordRaidInstanceProvisioner;
      }
    ).createDiscordRaidInstanceProvisioner = originalCreateProvisioner;
    (
      inspectorModule as {
        createDiscordRaidRecoveryInspector: typeof inspectorModule.createDiscordRaidRecoveryInspector;
      }
    ).createDiscordRaidRecoveryInspector = originalCreateInspector;
    (
      tierRoleRewardsModule as {
        grantRaidTierRoleRewards: typeof tierRoleRewardsModule.grantRaidTierRoleRewards;
      }
    ).grantRaidTierRoleRewards = originalGrantRaidTierRoleRewards;
    db.close();
    clearModules(modulePaths);
  }
});
