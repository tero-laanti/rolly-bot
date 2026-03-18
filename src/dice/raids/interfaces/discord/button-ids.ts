export const raidJoinButtonPrefix = "raid-join:";

export const buildRaidJoinButtonId = (raidId: string): string => {
  return `${raidJoinButtonPrefix}${raidId}`;
};

export const parseRaidJoinButtonId = (customId: string): string | null => {
  if (!customId.startsWith(raidJoinButtonPrefix)) {
    return null;
  }

  const raidId = customId.slice(raidJoinButtonPrefix.length).trim();
  return raidId.length > 0 ? raidId : null;
};
