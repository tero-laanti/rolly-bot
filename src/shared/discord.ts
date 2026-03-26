import { secondMs } from "./time";
import { truncateWithSuffix } from "./text";

export const discordMessageCharacterLimit = 2_000;
export const discordEmbedTitleCharacterLimit = 256;
export const discordEmbedDescriptionCharacterLimit = 4_096;
export const discordEmbedFieldValueCharacterLimit = 1_024;
export const discordButtonLabelCharacterLimit = 80;
export const discordStringSelectOptionLimit = 25;
export const discordStringSelectOptionLabelCharacterLimit = 100;
export const discordStringSelectOptionDescriptionCharacterLimit = 100;
export const discordActionRowLimit = 5;
export const discordComponentsPerActionRowLimit = 5;

export const formatDiscordRelativeTime = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / secondMs)}:R>`;
};

export const formatDiscordFullTime = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / secondMs)}:f>`;
};

export const assertDiscordTextLength = (value: string, label: string, maxLength: number): void => {
  if (value.length > maxLength) {
    throw new Error(`${label} must be <= ${maxLength} characters.`);
  }
};

export const truncateDiscordText = (
  value: string,
  maxLength: number,
  suffix: string = "...",
): string => {
  return truncateWithSuffix(value, maxLength, suffix);
};
