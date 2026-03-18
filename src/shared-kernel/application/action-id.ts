export const encodeActionId = (prefix: string, ...parts: Array<string | number>): string => {
  return `${prefix}${parts.join(":")}`;
};

export const parseActionId = (customId: string, prefix: string): string[] | null => {
  if (!customId.startsWith(prefix)) {
    return null;
  }

  return customId.slice(prefix.length).split(":");
};
