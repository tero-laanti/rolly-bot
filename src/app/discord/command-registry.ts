import type { ButtonInteraction } from "discord.js";
import * as diceAchievementsCommand from "../../dice/progression/interfaces/discord/commands/dice-achievements.command";
import * as diceBansCommand from "../../dice/progression/interfaces/discord/commands/dice-bans.command";
import * as diceCommand from "../../dice/progression/interfaces/discord/commands/dice.command";
import * as dicePrestigeCommand from "../../dice/progression/interfaces/discord/commands/dice-prestige.command";
import * as diceAdminCommand from "../../dice/admin/interfaces/discord/commands/dice-admin.command";
import * as diceAnalyticsCommand from "../../dice/analytics/interfaces/discord/commands/dice-analytics.command";
import * as diceCasinoCommand from "../../dice/casino/interfaces/discord/commands/dice-casino.command";
import * as diceBalanceCommand from "../../dice/economy/interfaces/discord/commands/dice-balance.command";
import * as diceLeaderboardsCommand from "../../dice/economy/interfaces/discord/commands/dice-leaderboards.command";
import * as diceInventoryCommand from "../../dice/inventory/interfaces/discord/commands/dice-inventory.command";
import * as diceShopCommand from "../../dice/inventory/interfaces/discord/commands/dice-shop.command";
import * as dicePvpCommand from "../../dice/pvp/interfaces/discord/commands/dice-pvp.command";
import * as selfUpdateCommand from "../../system/self-update/interfaces/discord/commands/self-update.command";
import type { Command } from "../../types/command";

export type DiscordButtonHandlerRegistration = {
  prefix: string;
  handle: (interaction: ButtonInteraction) => Promise<void>;
};

type DiscordCommandModule = Command & {
  buttonHandlers?: DiscordButtonHandlerRegistration[];
};

const discordCommandModules: DiscordCommandModule[] = [
  diceCommand,
  dicePrestigeCommand,
  diceBansCommand,
  diceAchievementsCommand,
  diceCasinoCommand,
  diceBalanceCommand,
  diceLeaderboardsCommand,
  diceShopCommand,
  diceInventoryCommand,
  dicePvpCommand,
  diceAnalyticsCommand,
  diceAdminCommand,
  selfUpdateCommand,
];

const validateUniqueCommandNames = (commands: Command[]): Command[] => {
  const seenNames = new Set<string>();
  for (const command of commands) {
    if (seenNames.has(command.data.name)) {
      throw new Error(`Duplicate command name registered: ${command.data.name}`);
    }

    seenNames.add(command.data.name);
  }

  return commands;
};

export const discordCommands: Command[] = validateUniqueCommandNames(
  discordCommandModules.map(({ data, execute }) => ({ data, execute })),
);

export const discordCommandPayloads = discordCommands.map((command) => command.data.toJSON());

export const discordButtonHandlers: DiscordButtonHandlerRegistration[] =
  discordCommandModules.flatMap((module) => module.buttonHandlers ?? []);
