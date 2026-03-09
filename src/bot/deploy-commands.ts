import fs from "node:fs";
import path from "node:path";
import { REST, Routes } from "discord.js";
import { requireEnv } from "../shared/env";

const token = requireEnv("DISCORD_TOKEN");
const clientId = requireEnv("DISCORD_CLIENT_ID");
const guildId = process.env.DISCORD_GUILD_ID;

const rest = new REST({ version: "10" }).setToken(token);

const loadCommands = async (): Promise<unknown[]> => {
  const commands = new Map<string, unknown>();
  const foldersPath = path.join(__dirname, "..", "commands");
  const commandFolders = fs.readdirSync(foldersPath).sort();

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js"))
      .sort();

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = await import(filePath);

      if ("data" in command && "execute" in command) {
        if (commands.has(command.data.name)) {
          console.warn(
            `[WARNING] Duplicate command name "${command.data.name}" at ${filePath}. Skipping.`,
          );
          continue;
        }

        commands.set(command.data.name, command.data.toJSON());
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    }
  }

  return Array.from(commands.values());
};

const deployCommands = async (): Promise<void> => {
  try {
    const commands = await loadCommands();
    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);
    const scope = guildId ? "guild" : "global";

    console.log(`Started refreshing ${commands.length} ${scope} application (/) commands.`);
    await rest.put(route, { body: commands });
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Failed to deploy commands:", error);
    process.exitCode = 1;
  } finally {
    // Ensure REST sweeper intervals are stopped so the process can exit.
    rest.clearHashSweeper();
    rest.clearHandlerSweeper();
  }
};

void deployCommands();
