import type { Message } from "discord.js";
import type { AchievementAnnouncement } from "../../progression/application/achievement-announcements";
import type { WorldBossOutcome, WorldBossStatus } from "../application/ports";
import type { WorldBossRewardDefinition } from "../domain/raid";

export type WorldBossLiveRuntimeLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type ActiveWorldBossBossRecord = {
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  reward: WorldBossRewardDefinition;
  totalDamage: number;
  totalAttacks: number;
  damageByUserId: Map<string, number>;
};

export type ActiveWorldBossRecord = {
  worldBossId: string;
  title: string;
  createdAtMs: number;
  status: WorldBossStatus;
  outcome: WorldBossOutcome | null;
  scheduledStartAtMs: number;
  startedAtMs: number | null;
  expiresAtMs: number | null;
  closedAtMs: number | null;
  participantIds: Set<string>;
  joinedUserIds: Set<string>;
  rewardEligibleUserIds: Set<string>;
  resolvedRewardSummary: string | null;
  achievementAnnouncements: AchievementAnnouncement[];
  activeThreadId: string | null;
  doubleRollRushChannelId: string | null;
  doubleRollRushExpiresAtMs: number | null;
  doubleRollRushFailed: boolean;
  boss: ActiveWorldBossBossRecord | null;
};

export type ActiveWorldBossHandles = {
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

export type ActiveWorldBossContext = {
  worldBoss: ActiveWorldBossRecord;
  handles: ActiveWorldBossHandles;
};
