import fs from "node:fs";
import path from "node:path";
import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import type { ButtonInteraction } from "discord.js";
import type { Command } from "../types/command";
import { diceBansButtonPrefix, handleDiceBansButton } from "../commands/dice/dice-bans";
import {
  dicePrestigeButtonPrefix,
  handleDicePrestigeButton,
} from "../commands/dice/dice-prestige";
import { diceAdminButtonPrefix, handleDiceAdminButton } from "../commands/dice/dice-admin";
import { dicePvpButtonPrefix, handleDicePvpButton } from "../commands/dice/dice-pvp";
import { dispatchButtonInteraction, registerButtonHandler } from "./button-router";
import { randomEventsFoundationConfig } from "../shared/config";
import { initDatabase } from "../shared/db";
import { requireEnv } from "../shared/env";
import { getRollyDataSourceDescription, primeRollyData } from "../rolly-data/load";
import {
  createRandomEventsLiveRuntime,
  type RandomEventsLiveRuntime,
} from "../dice/features/random-events/runtime";
import { startRandomEventsFoundationScheduler } from "../dice/features/random-events/scheduler";
import { randomEventButtonPrefix } from "../dice/features/random-events/interaction-window";
import {
  clearRandomEventsAdminController,
  registerRandomEventsAdminController,
} from "../dice/features/random-events/admin";
import { createRandomEventsState } from "../dice/features/random-events/state";

const token = requireEnv("DISCORD_TOKEN");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection<string, Command>();

let randomEventsLiveRuntime: RandomEventsLiveRuntime | null = null;

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

registerButtonHandler(diceBansButtonPrefix, handleDiceBansButton);
registerButtonHandler(dicePrestigeButtonPrefix, handleDicePrestigeButton);
registerButtonHandler(diceAdminButtonPrefix, handleDiceAdminButton);
registerButtonHandler(dicePvpButtonPrefix, handleDicePvpButton);
registerButtonHandler(randomEventButtonPrefix, handleRandomEventButton);

let stopRandomEventsScheduler: (() => void) | null = null;

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

const stopBackgroundSchedulers = (): void => {
  clearRandomEventsAdminController();

  if (stopRandomEventsScheduler) {
    stopRandomEventsScheduler();
    stopRandomEventsScheduler = null;
  }

  if (randomEventsLiveRuntime) {
    randomEventsLiveRuntime.stop();
    randomEventsLiveRuntime = null;
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

const isCommandFile = (file: string): boolean => {
  return file.endsWith(".js") && file !== "config.js";
};

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

const loadCommands = async (): Promise<void> => {
  const foldersPath = path.join(__dirname, "..", "commands");
  const commandFolders = fs.readdirSync(foldersPath).sort();

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(isCommandFile).sort();

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = await import(filePath);

      if ("data" in command && "execute" in command) {
        if (client.commands.has(command.data.name)) {
          console.warn(
            `[WARNING] Duplicate command name "${command.data.name}" at ${filePath}. Skipping.`,
          );
          continue;
        }

        client.commands.set(command.data.name, command as Command);
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    }
  }
};

const start = async (): Promise<void> => {
  try {
    initializeRollyData();
    initDatabase();
    await loadCommands();
    await client.login(token);
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exitCode = 1;
  }
};

void start();
