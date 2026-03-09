import type { ButtonInteraction } from "discord.js";

export type ButtonHandler = (interaction: ButtonInteraction) => Promise<void>;

const handlers: Array<{ prefix: string; handler: ButtonHandler }> = [];

export const registerButtonHandler = (prefix: string, handler: ButtonHandler): void => {
  if (handlers.some((entry) => entry.prefix === prefix)) {
    throw new Error(`Button handler already registered for prefix: ${prefix}`);
  }
  handlers.push({ prefix, handler });
};

export const dispatchButtonInteraction = async (
  interaction: ButtonInteraction,
): Promise<boolean> => {
  for (const entry of handlers) {
    if (interaction.customId.startsWith(entry.prefix)) {
      await entry.handler(interaction);
      return true;
    }
  }

  return false;
};
