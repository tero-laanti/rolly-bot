export type WorldBossState = {
  lastTriggeredAtMs: number | null;
};

export const createWorldBossState = (): WorldBossState => {
  return {
    lastTriggeredAtMs: null,
  };
};

export const setLastWorldBossTriggeredAt = (state: WorldBossState, now: Date): void => {
  state.lastTriggeredAtMs = now.getTime();
};

export const getLastWorldBossTriggeredAt = (state: WorldBossState): Date | null => {
  if (state.lastTriggeredAtMs === null) {
    return null;
  }

  return new Date(state.lastTriggeredAtMs);
};
