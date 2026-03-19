import type { Message } from "discord.js";
import type { RaidStatus } from "../application/ports";

export type RaidsLiveRuntimeLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type ActiveRaidRecord = {
  raidId: string;
  title: string;
  createdAtMs: number;
  status: RaidStatus;
  scheduledStartAtMs: number;
  startedAtMs: number | null;
  expiresAtMs: number | null;
  closedAtMs: number | null;
  participantIds: Set<string>;
};

export type ActiveRaidHandles = {
  announcementMessage: Message;
  activeMessage: Message | null;
  startTimer: ReturnType<typeof setTimeout> | null;
  resolveTimer: ReturnType<typeof setTimeout> | null;
  announcementEditChain: Promise<void>;
  transitionChain: Promise<void>;
};

export type ActiveRaidContext = {
  raid: ActiveRaidRecord;
  handles: ActiveRaidHandles;
};
