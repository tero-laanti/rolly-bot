import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const moduleRequire = createRequire(__filename);

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

const stubCatalogReader = {
  listRaidTiers: () => [
    {
      tierId: "bronze",
      name: "Bronze Raids",
      summary: "Entry raids.",
      bosses: [
        {
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
        },
      ],
    },
  ],
  getRaidTier: () => ({
    tierId: "bronze",
    name: "Bronze Raids",
    summary: "Entry raids.",
    bosses: [],
  }),
  getRaidBoss: () => null,
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
      accessRoleId: "raid-role",
    },
  },
} as const;

test("raids live runtime rejects protected actions when the actor lacks the tier access role", async () => {
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

    const runtime = createRaidsLiveRuntime({
      client: {} as never,
      config: baseConfig,
      logger: console,
    });

    await runtime.handleButtonInteraction(interaction);

    assert.equal(handleRaidActionCalled, false);
    assert.deepEqual(repliedPayload, {
      content: "You do not have access to this raid tier.",
      ephemeral: true,
    });
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
