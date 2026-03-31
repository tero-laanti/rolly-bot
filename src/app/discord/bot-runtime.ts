import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import type { ButtonInteraction } from "discord.js";
import {
  discordButtonHandlers,
  discordCommands,
  discordStringSelectMenuHandlers,
} from "./command-registry";
import { dispatchButtonInteraction, registerButtonHandler } from "./button-router";
import {
  dispatchStringSelectMenuInteraction,
  registerStringSelectMenuHandler,
} from "./string-select-menu-router";
import {
  contractMasterConfig,
  introPostsConfig,
  raidsConfig,
  randomEventsFoundationConfig,
  worldBossConfig,
} from "../../shared/config";
import { getDatabase, initDatabase } from "../../shared/db";
import { requireEnv } from "../../shared/env";
import { getRollyDataSourceDescription, primeRollyData } from "../../rolly-data/load";
import type { Command } from "../../types/command";
import { createRandomEventsLiveRuntime } from "../../dice/random-events/infrastructure/live-runtime";
import { startRandomEventsFoundationScheduler } from "../../dice/random-events/infrastructure/foundation-scheduler";
import {
  clearRandomEventsAdminController,
  registerRandomEventsAdminController,
} from "../../dice/random-events/infrastructure/admin-controller";
import { createRandomEventsState } from "../../dice/random-events/infrastructure/state-store";
import { randomEventButtonPrefix } from "../../dice/random-events/interfaces/discord/button-ids";
import { createWorldBossLiveRuntime } from "../../dice/world-boss/infrastructure/live-runtime";
import { startWorldBossFoundationScheduler } from "../../dice/world-boss/infrastructure/foundation-scheduler";
import {
  clearWorldBossAdminController,
  registerWorldBossAdminController,
} from "../../dice/world-boss/infrastructure/admin-controller";
import {
  worldBossJoinButtonPrefix,
  worldBossLeaveButtonPrefix,
} from "../../dice/world-boss/interfaces/discord/button-ids";
import { createWorldBossState } from "../../dice/world-boss/infrastructure/state-store";
import { startDicePvpChallengeExpirationRuntime } from "../../dice/pvp/infrastructure/challenge-expiration-runtime";
import { syncContractMasterPanelOnStartup } from "../../dice/contracts/infrastructure/contract-master-panel-sync";
import { syncIntroPostsOnStartup } from "../../system/intro-posts/infrastructure/startup-sync";
import { createRaidsLiveRuntime } from "../../dice/raids/infrastructure/live-runtime";
import {
  clearRaidsController,
  registerRaidsController,
} from "../../dice/raids/infrastructure/admin-controller";
import { raidButtonPrefix } from "../../dice/raids/interfaces/discord/buttons/raid-buttons";
import { syncRaidTierPanelsOnStartup } from "../../dice/raids/infrastructure/tier-panel-sync";

const token = requireEnv("DISCORD_TOKEN");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection<string, Command>();

const registerDiscordCommands = (): void => {
  for (const command of discordCommands) {
    if (client.commands.has(command.data.name)) {
      throw new Error(`Duplicate command name "${command.data.name}" in Discord runtime.`);
    }

    client.commands.set(command.data.name, command);
  }
};

let randomEventsLiveRuntime: ReturnType<typeof createRandomEventsLiveRuntime> | null = null;
let stopRandomEventsScheduler: (() => void) | null = null;
let worldBossLiveRuntime: ReturnType<typeof createWorldBossLiveRuntime> | null = null;
let stopWorldBossScheduler: (() => void) | null = null;
let stopDicePvpChallengeExpirationRuntime: (() => void) | null = null;
let raidsLiveRuntime: ReturnType<typeof createRaidsLiveRuntime> | null = null;

const handleRandomEventButton = async (interaction: ButtonInteraction): Promise<void> => {
  if (!randomEventsLiveRuntime) {
    await interaction.reply({
      content: "Random events are currently unavailable.",
      ephemeral: true,
    });
    return;
  }

  await randomEventsLiveRuntime.handleButtonInteraction(interaction);
};

const handleWorldBossButton = async (interaction: ButtonInteraction): Promise<void> => {
  if (!worldBossLiveRuntime) {
    await interaction.reply({
      content: "World Boss is currently unavailable.",
      ephemeral: true,
    });
    return;
  }

  await worldBossLiveRuntime.handleButtonInteraction(interaction);
};

const handleRaidButton = async (interaction: ButtonInteraction): Promise<void> => {
  if (!raidsLiveRuntime) {
    await interaction.reply({
      content: "Raids are currently unavailable.",
      ephemeral: true,
    });
    return;
  }

  await raidsLiveRuntime.handleButtonInteraction(interaction);
};

const registerDiscordButtonHandlers = (): void => {
  for (const handler of discordButtonHandlers) {
    registerButtonHandler(handler.prefix, handler.handle);
  }

  registerButtonHandler(randomEventButtonPrefix, handleRandomEventButton);
  registerButtonHandler(worldBossJoinButtonPrefix, handleWorldBossButton);
  registerButtonHandler(worldBossLeaveButtonPrefix, handleWorldBossButton);
  registerButtonHandler(raidButtonPrefix, handleRaidButton);
};

const registerDiscordStringSelectMenuHandlers = (): void => {
  for (const handler of discordStringSelectMenuHandlers) {
    registerStringSelectMenuHandler(handler.prefix, handler.handle);
  }
};

const startRandomEventsFoundation = (): void => {
  if (!randomEventsFoundationConfig.enabled) {
    console.log(
      `[random-events] Foundation scheduler inactive. ${randomEventsFoundationConfig.inactiveReason ?? "No activation reason provided."}`,
    );
    return;
  }

  if (stopRandomEventsScheduler) {
    return;
  }

  const randomEventsState = createRandomEventsState();
  randomEventsLiveRuntime = createRandomEventsLiveRuntime({
    client,
    config: randomEventsFoundationConfig,
    state: randomEventsState,
    logger: console,
  });

  const scheduler = startRandomEventsFoundationScheduler({
    config: randomEventsFoundationConfig,
    state: randomEventsState,
    onTriggerOpportunity: randomEventsLiveRuntime.onTriggerOpportunity,
    logger: console,
  });
  stopRandomEventsScheduler = scheduler.stop;

  registerRandomEventsAdminController({
    config: randomEventsFoundationConfig,
    state: randomEventsState,
    runtime: randomEventsLiveRuntime,
    scheduler,
  });

  console.log("[random-events] Foundation scheduler started.");
};

const startWorldBossFoundation = (): void => {
  if (!worldBossConfig.enabled) {
    registerWorldBossAdminController({
      config: worldBossConfig,
      runtime: null,
      state: null,
      scheduler: null,
    });
    console.log(
      `[world-boss] Lifecycle runtime inactive. ${worldBossConfig.inactiveReason ?? "No activation reason provided."}`,
    );
    return;
  }

  if (worldBossLiveRuntime || stopWorldBossScheduler) {
    return;
  }

  const worldBossState = createWorldBossState();
  worldBossLiveRuntime = createWorldBossLiveRuntime({
    client,
    config: worldBossConfig,
    logger: console,
  });

  const worldBossScheduler = startWorldBossFoundationScheduler({
    config: worldBossConfig,
    state: worldBossState,
    hasBlockingWorldBoss: worldBossLiveRuntime.hasBlockingWorldBoss,
    onTriggerOpportunity: async () =>
      worldBossLiveRuntime?.triggerWorldBossNow() ?? { created: false },
    logger: console,
  });
  stopWorldBossScheduler = worldBossScheduler.stop;

  registerWorldBossAdminController({
    config: worldBossConfig,
    runtime: worldBossLiveRuntime,
    state: worldBossState,
    scheduler: worldBossScheduler,
  });

  console.log(
    worldBossConfig.targetWorldBossesPerDay > 0
      ? "[world-boss] Lifecycle runtime and scheduler started."
      : "[world-boss] Lifecycle runtime started. Random scheduling is off.",
  );
};

const startDicePvpChallengeExpiration = (): void => {
  if (stopDicePvpChallengeExpirationRuntime) {
    return;
  }

  const runtime = startDicePvpChallengeExpirationRuntime({
    db: getDatabase(),
    logger: console,
  });
  stopDicePvpChallengeExpirationRuntime = runtime.stop;

  console.log("[pvp] Challenge expiration runtime started.");
};

const startRaidsRuntime = async (): Promise<void> => {
  if (!raidsConfig.enabled) {
    console.log(
      `[raids] Runtime inactive. ${raidsConfig.inactiveReason ?? "No activation reason provided."}`,
    );
    return;
  }

  if (raidsLiveRuntime) {
    return;
  }

  const runtime = createRaidsLiveRuntime({
    client,
    config: raidsConfig,
    logger: console,
  });

  await syncRaidTierPanelsOnStartup({
    client,
    config: raidsConfig,
    db: getDatabase(),
    logger: console,
  });
  await runtime.recoverRunsOnStartup();

  raidsLiveRuntime = runtime;
  registerRaidsController({
    runtime,
  });
  console.log("[raids] Runtime, recovery, and tier panel sync started.");
};

const stopBackgroundSchedulers = async (): Promise<void> => {
  clearRandomEventsAdminController();
  clearWorldBossAdminController();
  clearRaidsController();

  if (stopRandomEventsScheduler) {
    stopRandomEventsScheduler();
    stopRandomEventsScheduler = null;
  }

  if (randomEventsLiveRuntime) {
    randomEventsLiveRuntime.stop();
    randomEventsLiveRuntime = null;
  }

  if (stopDicePvpChallengeExpirationRuntime) {
    stopDicePvpChallengeExpirationRuntime();
    stopDicePvpChallengeExpirationRuntime = null;
  }

  if (stopWorldBossScheduler) {
    stopWorldBossScheduler();
    stopWorldBossScheduler = null;
  }

  if (worldBossLiveRuntime) {
    await worldBossLiveRuntime.stop();
    worldBossLiveRuntime = null;
  }

  if (raidsLiveRuntime) {
    await raidsLiveRuntime.stop();
    raidsLiveRuntime = null;
  }
};

let shutdownInProgress = false;

type ShutdownSignal = "SIGINT" | "SIGTERM";

const shutdown = async (signal: ShutdownSignal): Promise<void> => {
  if (shutdownInProgress) {
    return;
  }

  shutdownInProgress = true;
  console.log(`Received ${signal}. Shutting down...`);

  await stopBackgroundSchedulers();
  client.destroy();
  process.exit(0);
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  void syncIntroPostsOnStartup({
    client,
    config: introPostsConfig,
    db: getDatabase(),
    logger: console,
  }).catch((error) => {
    console.error("[intro-posts] Startup sync failed:", error);
  });
  void syncContractMasterPanelOnStartup({
    client,
    config: contractMasterConfig,
    db: getDatabase(),
    logger: console,
  }).catch((error) => {
    console.error("[contract-master] Startup sync failed:", error);
  });
  void startRaidsRuntime().catch((error) => {
    console.error("[raids] Startup runtime failed:", error);
  });
  startRandomEventsFoundation();
  startWorldBossFoundation();
  startDicePvpChallengeExpiration();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }

    return;
  }

  if (interaction.isButton()) {
    try {
      const handled = await dispatchButtonInteraction(interaction);
      if (!handled) {
        return;
      }
    } catch (error) {
      console.error("Error handling button interaction:", error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while handling this action!",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: "There was an error while handling this action!",
        ephemeral: true,
      });
    }

    return;
  }

  if (interaction.isStringSelectMenu()) {
    try {
      const handled = await dispatchStringSelectMenuInteraction(interaction);
      if (!handled) {
        return;
      }
    } catch (error) {
      console.error("Error handling string select interaction:", error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while handling this selection!",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: "There was an error while handling this selection!",
        ephemeral: true,
      });
    }
  }
});

const initializeRollyData = (): void => {
  const loaded = primeRollyData();
  const sourceDescription = getRollyDataSourceDescription();
  if (loaded.source.kind === "example") {
    console.warn(`[rolly-data] Loaded public example data from ${sourceDescription}.`);
    console.warn("[rolly-data] Example data is for local development only.");
    return;
  }

  console.log(`[rolly-data] Loaded game data from ${sourceDescription}.`);
  if (loaded.contracts === null) {
    console.warn(
      "[contracts] contracts.v2.json is missing from local rolly-data. Contracts are disabled.",
    );
  }
};

export const startDiscordBot = async (): Promise<void> => {
  try {
    initializeRollyData();
    initDatabase();
    registerDiscordCommands();
    registerDiscordButtonHandlers();
    registerDiscordStringSelectMenuHandlers();
    await client.login(token);
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exitCode = 1;
  }
};
