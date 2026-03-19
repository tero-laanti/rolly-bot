import type { Message } from "discord.js";
import type { RaidStatus } from "../application/ports";

export type RaidsLiveRuntimeLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type ActiveRaidContext = {
  raidId: string;
  title: string;
  status: RaidStatus;
  announcementMessage: Message;
  activeMessage: Message | null;
  scheduledStartAtMs: number;
  expiresAtMs: number | null;
  participantIds: Set<string>;
  startTimer: ReturnType<typeof setTimeout> | null;
  resolveTimer: ReturnType<typeof setTimeout> | null;
  announcementEditChain: Promise<void>;
};
