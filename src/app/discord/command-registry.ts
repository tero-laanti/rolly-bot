import type { ButtonInteraction } from "discord.js";
import * as achievementsCommand from "../../dice/progression/interfaces/discord/commands/achievements.command";
import * as bansCommand from "../../dice/progression/interfaces/discord/commands/bans.command";
import * as rCommand from "../../dice/progression/interfaces/discord/commands/r.command";
import * as rollCommand from "../../dice/progression/interfaces/discord/commands/roll.command";
import * as prestigeCommand from "../../dice/progression/interfaces/discord/commands/prestige.command";
import * as adminCommand from "../../dice/admin/interfaces/discord/commands/admin.command";
import * as analyticsCommand from "../../dice/analytics/interfaces/discord/commands/analytics.command";
import * as casinoCommand from "../../dice/casino/interfaces/discord/commands/casino.command";
import * as balanceCommand from "../../dice/economy/interfaces/discord/commands/balance.command";
import * as leaderboardsCommand from "../../dice/economy/interfaces/discord/commands/leaderboards.command";
import * as inventoryCommand from "../../dice/inventory/interfaces/discord/commands/inventory.command";
import * as shopCommand from "../../dice/inventory/interfaces/discord/commands/shop.command";
import * as pvpCommand from "../../dice/pvp/interfaces/discord/commands/pvp.command";
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
  rollCommand,
  rCommand,
  prestigeCommand,
  bansCommand,
  achievementsCommand,
  casinoCommand,
  balanceCommand,
  leaderboardsCommand,
  shopCommand,
  inventoryCommand,
  pvpCommand,
  analyticsCommand,
  adminCommand,
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
