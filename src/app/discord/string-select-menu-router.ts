import type { StringSelectMenuInteraction } from "discord.js";

export type StringSelectMenuHandler = (interaction: StringSelectMenuInteraction) => Promise<void>;

const handlers: Array<{ prefix: string; handler: StringSelectMenuHandler }> = [];

export const registerStringSelectMenuHandler = (
  prefix: string,
  handler: StringSelectMenuHandler,
): void => {
  if (handlers.some((entry) => entry.prefix === prefix)) {
    throw new Error(`String select menu handler already registered for prefix: ${prefix}`);
  }

  handlers.push({ prefix, handler });
};

export const dispatchStringSelectMenuInteraction = async (
  interaction: StringSelectMenuInteraction,
): Promise<boolean> => {
  for (const entry of handlers) {
    if (interaction.customId.startsWith(entry.prefix)) {
      await entry.handler(interaction);
      return true;
    }
  }

  return false;
};
