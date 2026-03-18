import { secondMs } from "./time";

export const discordMessageCharacterLimit = 2_000;

export const formatDiscordRelativeTime = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / secondMs)}:R>`;
};

export const formatDiscordFullTime = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / secondMs)}:f>`;
};
