import { REST, Routes } from "discord.js";
import { discordCommandPayloads } from "./command-registry";
import { requireEnv } from "../../shared/env";

export const deployDiscordCommands = async (): Promise<void> => {
  const token = requireEnv("DISCORD_TOKEN");
  const clientId = requireEnv("DISCORD_CLIENT_ID");
  const guildId = process.env.DISCORD_GUILD_ID;
  const rest = new REST({ version: "10" }).setToken(token);

  try {
    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);
    const scope = guildId ? "guild" : "global";

    console.log(
      `Started refreshing ${discordCommandPayloads.length} ${scope} application (/) commands.`,
    );
    await rest.put(route, { body: discordCommandPayloads });
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Failed to deploy commands:", error);
    process.exitCode = 1;
  } finally {
    rest.clearHashSweeper();
    rest.clearHandlerSweeper();
  }
};
