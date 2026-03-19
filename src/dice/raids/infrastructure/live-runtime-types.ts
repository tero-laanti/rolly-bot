import type { Message } from "discord.js";
import type { RaidOutcome, RaidStatus } from "../application/ports";
import type { RaidRewardDefinition } from "../domain/raid";

export type RaidsLiveRuntimeLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type ActiveRaidBossRecord = {
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  reward: RaidRewardDefinition;
  totalDamage: number;
  totalAttacks: number;
  damageByUserId: Map<string, number>;
};

export type ActiveRaidRecord = {
  raidId: string;
  title: string;
  createdAtMs: number;
  status: RaidStatus;
  outcome: RaidOutcome | null;
  scheduledStartAtMs: number;
  startedAtMs: number | null;
  expiresAtMs: number | null;
  closedAtMs: number | null;
  participantIds: Set<string>;
  rewardEligibleUserIds: Set<string>;
  activeThreadId: string | null;
  boss: ActiveRaidBossRecord | null;
};

export type ActiveRaidHandles = {
  announcementMessage: Message;
  activeMessage: Message | null;
  activeRenderTimer: ReturnType<typeof setTimeout> | null;
  lastActiveRenderAtMs: number;
  activeEditChain: Promise<void>;
  startTimer: ReturnType<typeof setTimeout> | null;
  resolveTimer: ReturnType<typeof setTimeout> | null;
  announcementEditChain: Promise<void>;
  transitionChain: Promise<void>;
};

export type ActiveRaidContext = {
  raid: ActiveRaidRecord;
  handles: ActiveRaidHandles;
};
