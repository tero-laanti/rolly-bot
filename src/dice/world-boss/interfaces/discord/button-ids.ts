export const worldBossJoinButtonPrefix = "world-boss-join:";
export const worldBossLeaveButtonPrefix = "world-boss-leave:";

export const buildWorldBossJoinButtonId = (worldBossId: string): string => {
  return `${worldBossJoinButtonPrefix}${worldBossId}`;
};

export const buildWorldBossLeaveButtonId = (worldBossId: string): string => {
  return `${worldBossLeaveButtonPrefix}${worldBossId}`;
};

export const parseWorldBossJoinButtonId = (customId: string): string | null => {
  if (!customId.startsWith(worldBossJoinButtonPrefix)) {
    return null;
  }

  const worldBossId = customId.slice(worldBossJoinButtonPrefix.length).trim();
  return worldBossId.length > 0 ? worldBossId : null;
};

export const parseWorldBossLeaveButtonId = (customId: string): string | null => {
  if (!customId.startsWith(worldBossLeaveButtonPrefix)) {
    return null;
  }

  const worldBossId = customId.slice(worldBossLeaveButtonPrefix.length).trim();
  return worldBossId.length > 0 ? worldBossId : null;
};
