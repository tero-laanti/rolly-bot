type RandomEventStateEntry = {
  id: string;
  createdAtMs: number;
  expiresAtMs: number | null;
};

export type RandomEventsState = {
  activeEventsById: Map<string, RandomEventStateEntry>;
  lastTriggeredAtMs: number | null;
};

export type RegisterActiveRandomEventInput = {
  id: string;
  createdAt: Date;
  expiresAt?: Date | null;
};

export const createRandomEventsState = (): RandomEventsState => {
  return {
    activeEventsById: new Map(),
    lastTriggeredAtMs: null,
  };
};

export const registerActiveRandomEvent = (
  state: RandomEventsState,
  { id, createdAt, expiresAt }: RegisterActiveRandomEventInput,
): void => {
  state.activeEventsById.set(id, {
    id,
    createdAtMs: createdAt.getTime(),
    expiresAtMs: expiresAt ? expiresAt.getTime() : null,
  });
};

export const resolveActiveRandomEvent = (state: RandomEventsState, eventId: string): boolean => {
  return state.activeEventsById.delete(eventId);
};

export const updateActiveRandomEventExpiry = (
  state: RandomEventsState,
  eventId: string,
  expiresAt: Date | null,
): boolean => {
  const entry = state.activeEventsById.get(eventId);
  if (!entry) {
    return false;
  }

  entry.expiresAtMs = expiresAt ? expiresAt.getTime() : null;
  return true;
};

export const getActiveRandomEventCount = (state: RandomEventsState): number => {
  return state.activeEventsById.size;
};

export const sweepExpiredActiveRandomEvents = (state: RandomEventsState, now: Date): number => {
  const nowMs = now.getTime();
  let removedCount = 0;

  for (const [eventId, entry] of state.activeEventsById.entries()) {
    if (entry.expiresAtMs === null || entry.expiresAtMs > nowMs) {
      continue;
    }

    state.activeEventsById.delete(eventId);
    removedCount += 1;
  }

  return removedCount;
};

export const setLastRandomEventTriggeredAt = (state: RandomEventsState, now: Date): void => {
  state.lastTriggeredAtMs = now.getTime();
};

export const getLastRandomEventTriggeredAt = (state: RandomEventsState): Date | null => {
  if (state.lastTriggeredAtMs === null) {
    return null;
  }

  return new Date(state.lastTriggeredAtMs);
};

export const getRandomEventsStateSnapshot = (
  state: RandomEventsState,
): {
  activeEventCount: number;
  lastTriggeredAt: Date | null;
} => {
  return {
    activeEventCount: state.activeEventsById.size,
    lastTriggeredAt: getLastRandomEventTriggeredAt(state),
  };
};
