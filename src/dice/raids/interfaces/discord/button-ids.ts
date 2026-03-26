export const raidJoinButtonPrefix = "raid-join:";
export const raidLeaveButtonPrefix = "raid-leave:";

export const buildRaidJoinButtonId = (raidId: string): string => {
  return `${raidJoinButtonPrefix}${raidId}`;
};

export const buildRaidLeaveButtonId = (raidId: string): string => {
  return `${raidLeaveButtonPrefix}${raidId}`;
};

export const parseRaidJoinButtonId = (customId: string): string | null => {
  if (!customId.startsWith(raidJoinButtonPrefix)) {
    return null;
  }

  const raidId = customId.slice(raidJoinButtonPrefix.length).trim();
  return raidId.length > 0 ? raidId : null;
};

export const parseRaidLeaveButtonId = (customId: string): string | null => {
  if (!customId.startsWith(raidLeaveButtonPrefix)) {
    return null;
  }

  const raidId = customId.slice(raidLeaveButtonPrefix.length).trim();
  return raidId.length > 0 ? raidId : null;
};
