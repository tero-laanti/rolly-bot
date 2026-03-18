import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import type { ButtonInteraction } from "discord.js";
import { discordButtonHandlers, discordCommands } from "./command-registry";
import { dispatchButtonInteraction, registerButtonHandler } from "./button-router";
import { randomEventsFoundationConfig, raidsConfig } from "../../shared/config";
import { initDatabase } from "../../shared/db";
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
import { createRaidsLiveRuntime } from "../../dice/raids/infrastructure/live-runtime";
import { createRaidsState } from "../../dice/raids/infrastructure/state-store";
import {
  clearRaidsAdminController,
  registerRaidsAdminController,
} from "../../dice/raids/infrastructure/admin-controller";
import { raidJoinButtonPrefix } from "../../dice/raids/interfaces/discord/button-ids";

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

const handleRaidJoinButton = async (interaction: ButtonInteraction): Promise<void> => {
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
  registerButtonHandler(raidJoinButtonPrefix, handleRaidJoinButton);
};

const startRandomEventsFoundation = (): void => {
  if (!randomEventsFoundationConfig.enabled) {
    console.log("[random-events] Foundation scheduler disabled by config.");
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

const startRaidsFoundation = (): void => {
  if (!raidsConfig.enabled) {
    console.log("[raids] Lifecycle runtime disabled by config.");
    return;
  }

  if (raidsLiveRuntime) {
    return;
  }

  const raidsState = createRaidsState();
  raidsLiveRuntime = createRaidsLiveRuntime({
    client,
    config: raidsConfig,
    state: raidsState,
    logger: console,
  });

  registerRaidsAdminController({
    config: raidsConfig,
    state: raidsState,
    runtime: raidsLiveRuntime,
  });

  console.log("[raids] Lifecycle runtime started.");
};

const stopBackgroundSchedulers = (): void => {
  clearRandomEventsAdminController();
  clearRaidsAdminController();

  if (stopRandomEventsScheduler) {
    stopRandomEventsScheduler();
    stopRandomEventsScheduler = null;
  }

  if (randomEventsLiveRuntime) {
    randomEventsLiveRuntime.stop();
    randomEventsLiveRuntime = null;
  }

  if (raidsLiveRuntime) {
    raidsLiveRuntime.stop();
    raidsLiveRuntime = null;
  }
};

let shutdownInProgress = false;

type ShutdownSignal = "SIGINT" | "SIGTERM";

const shutdown = (signal: ShutdownSignal): void => {
  if (shutdownInProgress) {
    return;
  }

  shutdownInProgress = true;
  console.log(`Received ${signal}. Shutting down...`);

  stopBackgroundSchedulers();
  client.destroy();
  process.exit(0);
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  startRandomEventsFoundation();
  startRaidsFoundation();
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
  }
});

const initializeRollyData = (): void => {
  const loaded = primeRollyData();
  const sourceDescription = getRollyDataSourceDescription();
  if (loaded.source.kind === "example") {
    console.warn(`[rolly-data] Loaded public example data from ${sourceDescription}.`);
    console.warn("[rolly-data] Example data mode is for local development only.");
    return;
  }

  console.log(`[rolly-data] Loaded game data from ${sourceDescription}.`);
};

export const startDiscordBot = async (): Promise<void> => {
  try {
    initializeRollyData();
    initDatabase();
    registerDiscordCommands();
    registerDiscordButtonHandlers();
    await client.login(token);
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exitCode = 1;
  }
};
