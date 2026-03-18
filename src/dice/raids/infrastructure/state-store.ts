import type { RaidStatus } from "../application/ports";

export type ActiveRaidStateEntry = {
  id: string;
  title: string;
  status: RaidStatus;
  createdAtMs: number;
  scheduledStartAtMs: number;
  expiresAtMs: number | null;
  participantIds: string[];
  channelId: string;
  announcementMessageId: string;
  activeMessageId: string | null;
};

export type RaidsState = {
  activeRaidsById: Map<string, ActiveRaidStateEntry>;
};

export const createRaidsState = (): RaidsState => {
  return {
    activeRaidsById: new Map(),
  };
};

export const registerActiveRaid = (state: RaidsState, entry: ActiveRaidStateEntry): void => {
  state.activeRaidsById.set(entry.id, entry);
};

export const updateActiveRaid = (
  state: RaidsState,
  raidId: string,
  patch: Partial<Omit<ActiveRaidStateEntry, "id" | "createdAtMs">>,
): boolean => {
  const entry = state.activeRaidsById.get(raidId);
  if (!entry) {
    return false;
  }

  Object.assign(entry, patch);
  return true;
};

export const resolveActiveRaid = (state: RaidsState, raidId: string): boolean => {
  return state.activeRaidsById.delete(raidId);
};

export const getRaidsStateSnapshot = (
  state: RaidsState,
): {
  activeRaidCount: number;
} => {
  return {
    activeRaidCount: state.activeRaidsById.size,
  };
};
