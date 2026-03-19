export type RaidsState = {
  lastTriggeredAtMs: number | null;
};

export const createRaidsState = (): RaidsState => {
  return {
    lastTriggeredAtMs: null,
  };
};

export const setLastRaidTriggeredAt = (state: RaidsState, now: Date): void => {
  state.lastTriggeredAtMs = now.getTime();
};

export const getLastRaidTriggeredAt = (state: RaidsState): Date | null => {
  if (state.lastTriggeredAtMs === null) {
    return null;
  }

  return new Date(state.lastTriggeredAtMs);
};
