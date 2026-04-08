import { randomUUID } from "node:crypto";
import {
  ChannelType,
  type BaseMessageOptions,
  type ButtonInteraction,
  type Client,
  type Message,
} from "discord.js";
import { publishAchievementEffects } from "../../../app/discord/achievement-effects";
import { publishContractCompletionAnnouncements } from "../../../app/discord/contract-completion-announcements";
import type { WorldBossConfig } from "../../../shared/config";
import { getDatabase } from "../../../shared/db";
import { createSqliteUnitOfWork } from "../../../shared/infrastructure/sqlite/unit-of-work";
import type { ContractsGameplayProgressPort } from "../../contracts/application/ports";
import { createSqliteContractsGameplayProgressPort } from "../../contracts/infrastructure/sqlite/services";
import { createSqliteEconomyRepository } from "../../economy/infrastructure/sqlite/balance-repository";
import { awardManualDiceAchievements } from "../../progression/application/achievement-awards";
import {
  createAchievementAnnouncement,
  mergeAchievementAnnouncements,
  type AchievementAnnouncement,
} from "../../progression/application/achievement-announcements";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";
import type {
  ApplyWorldBossDiceRollInput,
  ApplyWorldBossDiceRollResult,
  GetWorldBossDoubleRollRushStatusInput,
  WorldBossDoubleRollRushStatus,
  WorldBossAdminLiveSnapshot,
  WorldBossBossSnapshot,
  WorldBossOutcome,
  WorldBossStatus,
  TriggerWorldBossNowOutcome,
} from "../application/ports";
import {
  worldBossDoubleRollRushDurationMs,
  worldBossDoubleRollRushChannelName,
} from "../domain/double-roll-rush";
import { getDiceWorldBossAchievementIds } from "../application/achievement-rules";
import {
  calculateWorldBossParticipantStrength,
  createWorldBoss,
  describeAppliedWorldBossReward,
  describeWorldBossReward,
} from "../domain/raid";
import {
  parseWorldBossJoinButtonId,
  parseWorldBossLeaveButtonId,
} from "../interfaces/discord/button-ids";
import {
  buildWorldBossActivePrompt,
  buildWorldBossAnnouncementPrompt,
  buildWorldBossCancelledPrompt,
  buildWorldBossInterruptedPrompt,
  buildWorldBossRollParadiseKickoffPrompt,
  buildWorldBossResolveFailedPrompt,
  buildWorldBossResolvedPrompt,
  buildWorldBossStartFailedPrompt,
} from "../interfaces/discord/prompt";
import { truncateDiscordText } from "../../../shared/discord";
import type {
  ActiveWorldBossContext,
  ActiveWorldBossRecord,
  WorldBossLiveRuntimeLogger,
} from "./live-runtime-types";
import {
  recordWorldBossHit,
  recordWorldBossJoin,
  recordWorldBossSuccessResolution,
} from "./achievement-stats-repository";
import { buildWorldBossHitSummary } from "./raid-hit-summary";
import {
  createSqliteWorldBossDoubleRollRushZoneRepository,
  type WorldBossDoubleRollRushZoneRecord,
} from "./sqlite/double-roll-rush-zone-repository";

type CreateWorldBossLiveRuntimeInput = {
  client: Client;
  config: WorldBossConfig;
  logger?: WorldBossLiveRuntimeLogger;
};

type QueueAnnouncementRenderInput = {
  context: ActiveWorldBossContext;
  logFailureMessage: string;
  allowedStatuses?: readonly WorldBossStatus[];
};

export type WorldBossLiveRuntime = {
  triggerWorldBossNow: () => Promise<TriggerWorldBossNowOutcome>;
  handleButtonInteraction: (interaction: ButtonInteraction) => Promise<void>;
  applyDiceRoll: (input: ApplyWorldBossDiceRollInput) => ApplyWorldBossDiceRollResult;
  getActiveDoubleRollRushStatus: (
    input: GetWorldBossDoubleRollRushStatusInput,
  ) => WorldBossDoubleRollRushStatus;
  getLiveWorldBossesSnapshot: () => WorldBossAdminLiveSnapshot[];
  recoverDoubleRollRushesOnStartup: (input?: { now?: Date }) => Promise<{
    resumedCount: number;
    expiredCount: number;
    invalidCount: number;
  }>;
  hasBlockingWorldBoss: () => boolean;
  stop: () => Promise<void>;
};

const worldBossTitle = "World Boss";
const worldBossProgressRenderThrottleMs = 1_500;
const maxContributionLines = 5;
const threadNameCharacterLimit = 100;
const doubleRollRushInactiveStatus: WorldBossDoubleRollRushStatus = {
  isActive: false,
  expiresAtMs: null,
};

const blockingWorldBossStatuses = new Set<WorldBossStatus>(["joining", "starting", "active"]);

type ActiveDoubleRollRushContext = {
  zone: WorldBossDoubleRollRushZoneRecord;
  expiryTimer: ReturnType<typeof setTimeout> | null;
};

type DoubleRollRushCleanupResult = "deleted" | "missing" | "retryable-failure";

const isBlockingWorldBossStatus = (status: WorldBossStatus): boolean => {
  return blockingWorldBossStatuses.has(status);
};

const participantIdsFromContext = (context: ActiveWorldBossContext): string[] => {
  return Array.from(context.worldBoss.participantIds);
};

const currentWorldBossStatus = (context: ActiveWorldBossContext): WorldBossStatus => {
  return context.worldBoss.status;
};

const buildWorldBossBossSnapshot = (
  context: ActiveWorldBossContext,
): WorldBossBossSnapshot | null => {
  if (!context.worldBoss.boss) {
    return null;
  }

  return {
    name: context.worldBoss.boss.name,
    level: context.worldBoss.boss.level,
    currentHp: context.worldBoss.boss.currentHp,
    maxHp: context.worldBoss.boss.maxHp,
    rewardSummary:
      context.worldBoss.resolvedRewardSummary ??
      describeWorldBossReward(context.worldBoss.boss.reward),
  };
};

const buildContributionLines = (context: ActiveWorldBossContext): string[] => {
  if (!context.worldBoss.boss) {
    return [];
  }

  return Array.from(context.worldBoss.boss.damageByUserId.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxContributionLines)
    .map(([userId, damage]) => `<@${userId}> - ${damage} dmg`);
};

const recordWorldBossJoinContractProgressSafely = ({
  contracts,
  logger,
  userId,
}: {
  contracts: Pick<ContractsGameplayProgressPort, "recordWorldBossJoin"> | undefined;
  logger: WorldBossLiveRuntimeLogger;
  userId: string;
}): ReturnType<ContractsGameplayProgressPort["recordWorldBossJoin"]> => {
  if (!contracts) {
    return null;
  }

  try {
    return contracts.recordWorldBossJoin({
      userId,
      occurredAt: new Date(),
    });
  } catch (error) {
    logger.warn("[contracts] Failed to record World Boss join progress.", error);
    return null;
  }
};

export const createWorldBossLiveRuntime = ({
  client,
  config,
  logger = console,
}: CreateWorldBossLiveRuntimeInput): WorldBossLiveRuntime => {
  const liveWorldBossesById = new Map<string, ActiveWorldBossContext>();
  const liveWorldBossIdsByThreadId = new Map<string, string>();
  const activeDoubleRollRushesById = new Map<string, ActiveDoubleRollRushContext>();
  const db = getDatabase();
  const contracts = createSqliteContractsGameplayProgressPort(db);
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const doubleRollRushZones = createSqliteWorldBossDoubleRollRushZoneRepository(db);
  const unitOfWork = createSqliteUnitOfWork(db);
  let stopping = false;
  let triggerChain: Promise<void> = Promise.resolve();

  const isCurrentContext = (context: ActiveWorldBossContext): boolean => {
    return liveWorldBossesById.get(context.worldBoss.worldBossId) === context;
  };

  const clearWorldBossTimers = (context: ActiveWorldBossContext): void => {
    if (context.handles.startTimer) {
      clearTimeout(context.handles.startTimer);
      context.handles.startTimer = null;
    }

    if (context.handles.resolveTimer) {
      clearTimeout(context.handles.resolveTimer);
      context.handles.resolveTimer = null;
    }

    if (context.handles.activeRenderTimer) {
      clearTimeout(context.handles.activeRenderTimer);
      context.handles.activeRenderTimer = null;
    }
  };

  const clearDoubleRollRushTimer = (context: ActiveDoubleRollRushContext): void => {
    if (context.expiryTimer) {
      clearTimeout(context.expiryTimer);
      context.expiryTimer = null;
    }
  };

  const finalizeDoubleRollRush = (context: ActiveDoubleRollRushContext): void => {
    clearDoubleRollRushTimer(context);
    activeDoubleRollRushesById.delete(context.zone.rushId);
  };

  const cleanupDoubleRollRushChannel = async (
    zone: WorldBossDoubleRollRushZoneRecord,
  ): Promise<DoubleRollRushCleanupResult> => {
    const fetchedChannel = await client.channels
      .fetch(zone.rushChannelId)
      .then((channel) => ({
        kind: "resolved" as const,
        channel,
      }))
      .catch((error) => {
        logger.warn("[world-boss] Failed to fetch Roll Paradise channel for cleanup.", error);
        return {
          kind: "failed" as const,
        };
      });

    if (fetchedChannel.kind === "failed") {
      return "retryable-failure";
    }

    if (!fetchedChannel.channel) {
      return "missing";
    }

    if ("delete" in fetchedChannel.channel && typeof fetchedChannel.channel.delete === "function") {
      const deleted = await fetchedChannel.channel
        .delete()
        .then(() => true)
        .catch((error: unknown) => {
          logger.warn("[world-boss] Failed to delete Roll Paradise channel.", error);
          return false;
        });

      return deleted ? "deleted" : "retryable-failure";
    }

    logger.warn("[world-boss] Roll Paradise channel could not be deleted by this runtime.");
    return "retryable-failure";
  };

  const reconcileClosedDoubleRollRushCleanup = async (
    zone: WorldBossDoubleRollRushZoneRecord,
    now: Date = new Date(),
  ): Promise<void> => {
    const cleanupResult = await cleanupDoubleRollRushChannel(zone);
    if (cleanupResult === "retryable-failure") {
      doubleRollRushZones.markCleanupPending({
        rushId: zone.rushId,
        now,
      });
      return;
    }

    doubleRollRushZones.clearCleanupPending({
      rushId: zone.rushId,
      now,
    });
  };

  const sendRollParadiseKickoffMessage = async ({
    rushChannel,
    bossName,
    endsAtMs,
  }: {
    rushChannel: {
      send: (
        payload: BaseMessageOptions & { content: string; allowedMentions: object },
      ) => Promise<{
        id: string;
      }>;
    };
    bossName: string;
    endsAtMs: number;
  }): Promise<{
    id: string;
  } | null> => {
    const content = `@here, the ${bossName} has fallen! The roll paradise is briefly open!`;
    const prompt = buildWorldBossRollParadiseKickoffPrompt({
      endsAtMs,
    });

    const kickoffMessage = await rushChannel
      .send({
        content,
        allowedMentions: {
          parse: ["everyone"],
        },
        ...prompt,
      })
      .catch((error: unknown) => {
        logger.warn(
          "[world-boss] Failed to post Roll Paradise kickoff message with @here mention.",
          error,
        );
        return null;
      });

    if (kickoffMessage) {
      return kickoffMessage;
    }

    return rushChannel
      .send({
        content,
        allowedMentions: {
          parse: [] as const,
        },
        ...prompt,
      })
      .catch((error: unknown) => {
        logger.warn("[world-boss] Failed to post Roll Paradise kickoff message.", error);
        return null;
      });
  };

  const closeDoubleRollRush = async ({
    rushId,
    closeReason,
    now = new Date(),
    cleanupChannel = true,
  }: {
    rushId: string;
    closeReason: string;
    now?: Date;
    cleanupChannel?: boolean;
  }): Promise<void> => {
    const closedZone = doubleRollRushZones.closeZone({
      rushId,
      closeReason,
      now,
    });
    const activeContext = activeDoubleRollRushesById.get(rushId);
    if (activeContext) {
      finalizeDoubleRollRush(activeContext);
    }

    if (!closedZone || !cleanupChannel) {
      return;
    }

    await reconcileClosedDoubleRollRushCleanup(closedZone, now);
  };

  const scheduleDoubleRollRushExpiry = (context: ActiveDoubleRollRushContext): void => {
    clearDoubleRollRushTimer(context);
    const delayMs = Math.max(0, context.zone.expiresAt.getTime() - Date.now());
    context.expiryTimer = setTimeout(() => {
      void closeDoubleRollRush({
        rushId: context.zone.rushId,
        closeReason: "expired",
      });
    }, delayMs);
  };

  const registerDoubleRollRush = (zone: WorldBossDoubleRollRushZoneRecord): void => {
    const existing = activeDoubleRollRushesById.get(zone.rushId);
    if (existing) {
      existing.zone = zone;
      scheduleDoubleRollRushExpiry(existing);
      return;
    }

    const context: ActiveDoubleRollRushContext = {
      zone,
      expiryTimer: null,
    };
    activeDoubleRollRushesById.set(zone.rushId, context);
    scheduleDoubleRollRushExpiry(context);
  };

  const finalizeWorldBoss = (context: ActiveWorldBossContext): void => {
    clearWorldBossTimers(context);
    if (!isCurrentContext(context)) {
      return;
    }

    if (context.worldBoss.activeThreadId) {
      liveWorldBossIdsByThreadId.delete(context.worldBoss.activeThreadId);
    }

    liveWorldBossesById.delete(context.worldBoss.worldBossId);
  };

  const buildLiveWorldBossSnapshot = (
    context: ActiveWorldBossContext,
  ): WorldBossAdminLiveSnapshot => {
    return {
      worldBossId: context.worldBoss.worldBossId,
      title: context.worldBoss.title,
      status: context.worldBoss.status,
      outcome: context.worldBoss.outcome,
      participantCount: context.worldBoss.participantIds.size,
      eligibleParticipantCount: context.worldBoss.rewardEligibleUserIds.size,
      scheduledStartAt: new Date(context.worldBoss.scheduledStartAtMs),
      expiresAt:
        context.worldBoss.expiresAtMs === null ? null : new Date(context.worldBoss.expiresAtMs),
      channelId: context.handles.announcementMessage.channelId,
      announcementMessageId: context.handles.announcementMessage.id,
      activeMessageId: context.handles.activeMessage?.id ?? null,
      activeThreadId: context.worldBoss.activeThreadId,
      boss: buildWorldBossBossSnapshot(context),
    };
  };

  const buildAnnouncementPromptForCurrentState = (
    context: ActiveWorldBossContext,
  ): BaseMessageOptions => {
    const participantIds = participantIdsFromContext(context);
    const boss = context.worldBoss.boss;

    switch (context.worldBoss.status) {
      case "joining":
        return buildWorldBossAnnouncementPrompt({
          worldBossId: context.worldBoss.worldBossId,
          participantIds,
          scheduledStartAtMs: context.worldBoss.scheduledStartAtMs,
        });
      case "starting":
      case "active":
        return buildWorldBossAnnouncementPrompt({
          worldBossId: context.worldBoss.worldBossId,
          participantIds,
          scheduledStartAtMs: context.worldBoss.scheduledStartAtMs,
          disabled: true,
          bossName: boss?.name ?? null,
          threadId: context.worldBoss.activeThreadId,
        });
      case "cancelled":
        return buildWorldBossCancelledPrompt({
          scheduledStartAtMs: context.worldBoss.scheduledStartAtMs,
        });
      case "interrupted":
        return buildWorldBossInterruptedPrompt({
          participantIds,
          bossName: boss?.name ?? null,
        });
      case "start-failed":
        return buildWorldBossStartFailedPrompt({
          participantIds,
        });
      case "resolved":
        if (boss && context.worldBoss.outcome) {
          return buildWorldBossResolvedPrompt({
            participantIds,
            eligibleParticipantCount: context.worldBoss.rewardEligibleUserIds.size,
            resolvedAtMs: context.worldBoss.closedAtMs ?? Date.now(),
            outcome: context.worldBoss.outcome,
            bossName: boss.name,
            bossLevel: boss.level,
            maxHp: boss.maxHp,
            rewardSummary:
              context.worldBoss.resolvedRewardSummary ?? describeWorldBossReward(boss.reward),
            contributionLines: buildContributionLines(context),
            doubleRollRushChannelId: context.worldBoss.doubleRollRushChannelId,
            doubleRollRushEndsAtMs: context.worldBoss.doubleRollRushExpiresAtMs,
            doubleRollRushFailed: context.worldBoss.doubleRollRushFailed,
          });
        }

        return buildWorldBossInterruptedPrompt({
          participantIds,
        });
      case "cleanup-needed":
        return buildWorldBossResolveFailedPrompt({
          participantIds,
          resolvedAtMs: context.worldBoss.closedAtMs ?? Date.now(),
          bossName: boss?.name ?? null,
          outcome: context.worldBoss.outcome,
        });
    }
  };

  const buildActivePromptForCurrentState = (
    context: ActiveWorldBossContext,
  ): BaseMessageOptions => {
    const participantIds = participantIdsFromContext(context);
    const boss = context.worldBoss.boss;

    switch (context.worldBoss.status) {
      case "active":
        if (!boss || !context.worldBoss.activeThreadId) {
          return buildWorldBossInterruptedPrompt({
            participantIds,
            bossName: boss?.name ?? null,
          });
        }

        return buildWorldBossActivePrompt({
          participantIds,
          eligibleParticipantCount: context.worldBoss.rewardEligibleUserIds.size,
          startedAtMs: context.worldBoss.startedAtMs ?? Date.now(),
          endsAtMs: context.worldBoss.expiresAtMs ?? Date.now(),
          threadId: context.worldBoss.activeThreadId,
          bossName: boss.name,
          bossLevel: boss.level,
          currentHp: boss.currentHp,
          maxHp: boss.maxHp,
          rewardSummary: describeWorldBossReward(boss.reward),
          totalDamage: boss.totalDamage,
          totalAttacks: boss.totalAttacks,
          contributionLines: buildContributionLines(context),
        });
      case "resolved":
        if (boss && context.worldBoss.outcome) {
          return buildWorldBossResolvedPrompt({
            participantIds,
            eligibleParticipantCount: context.worldBoss.rewardEligibleUserIds.size,
            resolvedAtMs: context.worldBoss.closedAtMs ?? Date.now(),
            outcome: context.worldBoss.outcome,
            bossName: boss.name,
            bossLevel: boss.level,
            maxHp: boss.maxHp,
            rewardSummary:
              context.worldBoss.resolvedRewardSummary ?? describeWorldBossReward(boss.reward),
            contributionLines: buildContributionLines(context),
            doubleRollRushChannelId: context.worldBoss.doubleRollRushChannelId,
            doubleRollRushEndsAtMs: context.worldBoss.doubleRollRushExpiresAtMs,
            doubleRollRushFailed: context.worldBoss.doubleRollRushFailed,
          });
        }

        return buildWorldBossInterruptedPrompt({
          participantIds,
          bossName: boss?.name ?? null,
        });
      case "interrupted":
        return buildWorldBossInterruptedPrompt({
          participantIds,
          bossName: boss?.name ?? null,
        });
      case "start-failed":
        return buildWorldBossStartFailedPrompt({
          participantIds,
        });
      default:
        return buildWorldBossInterruptedPrompt({
          participantIds,
          bossName: boss?.name ?? null,
        });
    }
  };

  const editMessage = async ({
    message,
    prompt,
    logFailureMessage,
  }: {
    message: Message;
    prompt: BaseMessageOptions;
    logFailureMessage: string;
  }): Promise<boolean> => {
    return message
      .edit(prompt)
      .then(() => true)
      .catch((error) => {
        logger.warn(logFailureMessage, error);
        return false;
      });
  };

  const queueAnnouncementRender = async ({
    context,
    logFailureMessage,
    allowedStatuses,
  }: QueueAnnouncementRenderInput): Promise<boolean> => {
    let updated = false;

    context.handles.announcementEditChain = context.handles.announcementEditChain
      .catch(() => {})
      .then(async () => {
        if (!isCurrentContext(context)) {
          return;
        }

        if (allowedStatuses && !allowedStatuses.includes(context.worldBoss.status)) {
          return;
        }

        updated = await editMessage({
          message: context.handles.announcementMessage,
          prompt: buildAnnouncementPromptForCurrentState(context),
          logFailureMessage,
        });
      });

    await context.handles.announcementEditChain;
    return updated;
  };

  const queueActiveRenderNow = async ({
    context,
    logFailureMessage,
  }: {
    context: ActiveWorldBossContext;
    logFailureMessage: string;
  }): Promise<boolean> => {
    if (!context.handles.activeMessage) {
      return false;
    }

    let updated = false;
    context.handles.activeEditChain = context.handles.activeEditChain
      .catch(() => {})
      .then(async () => {
        if (!isCurrentContext(context)) {
          return;
        }

        updated = await editMessage({
          message: context.handles.activeMessage as Message,
          prompt: buildActivePromptForCurrentState(context),
          logFailureMessage,
        });

        if (updated) {
          context.handles.lastActiveRenderAtMs = Date.now();
        }
      });

    await context.handles.activeEditChain;
    return updated;
  };

  const scheduleActiveRender = (
    context: ActiveWorldBossContext,
    logFailureMessage: string,
  ): void => {
    if (!context.handles.activeMessage || currentWorldBossStatus(context) !== "active") {
      return;
    }

    if (context.handles.activeRenderTimer) {
      return;
    }

    const elapsedMs = Date.now() - context.handles.lastActiveRenderAtMs;
    const delayMs = Math.max(0, worldBossProgressRenderThrottleMs - elapsedMs);

    context.handles.activeRenderTimer = setTimeout(() => {
      context.handles.activeRenderTimer = null;
      void queueActiveRenderNow({
        context,
        logFailureMessage,
      });
    }, delayMs);
  };

  const queueTransition = async (
    context: ActiveWorldBossContext,
    transition: () => Promise<void>,
  ): Promise<void> => {
    context.handles.transitionChain = context.handles.transitionChain
      .catch(() => {})
      .then(async () => {
        if (!isCurrentContext(context)) {
          return;
        }

        await transition();
      });

    await context.handles.transitionChain;
  };

  const scheduleStart = (context: ActiveWorldBossContext): void => {
    const delayMs = Math.max(0, context.worldBoss.scheduledStartAtMs - Date.now());
    context.handles.startTimer = setTimeout(() => {
      void queueTransition(context, async () => {
        await runStartTransition(context);
      }).catch((error) => {
        logger.warn("[world-boss] Failed to transition World Boss into active state.", error);
      });
    }, delayMs);
  };

  const scheduleResolve = (context: ActiveWorldBossContext): void => {
    const delayMs = Math.max(0, (context.worldBoss.expiresAtMs ?? Date.now()) - Date.now());
    context.handles.resolveTimer = setTimeout(() => {
      void queueTransition(context, async () => {
        await runFailureResolveTransition(context);
      }).catch((error) => {
        logger.warn("[world-boss] Failed to resolve World Boss lifecycle.", error);
      });
    }, delayMs);
  };

  const transitionToStarting = (context: ActiveWorldBossContext): void => {
    context.worldBoss.status = "starting";
    context.worldBoss.outcome = null;
    context.worldBoss.startedAtMs = null;
    context.worldBoss.expiresAtMs = null;
    context.worldBoss.closedAtMs = null;
    context.worldBoss.activeThreadId = null;
    context.worldBoss.rewardEligibleUserIds.clear();
    context.worldBoss.resolvedRewardSummary = null;
    context.worldBoss.doubleRollRushChannelId = null;
    context.worldBoss.doubleRollRushExpiresAtMs = null;
    context.worldBoss.doubleRollRushFailed = false;
    context.worldBoss.boss = null;
  };

  const transitionToActive = (
    context: ActiveWorldBossContext,
    {
      startedAtMs,
      expiresAtMs,
      activeThreadId,
      boss,
    }: {
      startedAtMs: number;
      expiresAtMs: number;
      activeThreadId: string;
      boss: NonNullable<ActiveWorldBossRecord["boss"]>;
    },
  ): void => {
    context.worldBoss.status = "active";
    context.worldBoss.outcome = null;
    context.worldBoss.startedAtMs = startedAtMs;
    context.worldBoss.expiresAtMs = expiresAtMs;
    context.worldBoss.closedAtMs = null;
    context.worldBoss.activeThreadId = activeThreadId;
    context.worldBoss.rewardEligibleUserIds.clear();
    context.worldBoss.resolvedRewardSummary = null;
    context.worldBoss.doubleRollRushChannelId = null;
    context.worldBoss.doubleRollRushExpiresAtMs = null;
    context.worldBoss.doubleRollRushFailed = false;
    context.worldBoss.boss = boss;
    liveWorldBossIdsByThreadId.set(activeThreadId, context.worldBoss.worldBossId);
  };

  const transitionToTerminal = (
    context: ActiveWorldBossContext,
    status: Extract<
      WorldBossStatus,
      "cancelled" | "interrupted" | "start-failed" | "resolved" | "cleanup-needed"
    >,
    {
      closedAtMs = Date.now(),
      outcome = null,
    }: {
      closedAtMs?: number;
      outcome?: WorldBossOutcome | null;
    } = {},
  ): void => {
    context.worldBoss.status = status;
    context.worldBoss.outcome = outcome;
    context.worldBoss.expiresAtMs = null;
    context.worldBoss.closedAtMs = closedAtMs;
  };

  const closeUntrackedWorldBossMessage = async ({
    message,
    participantIds,
    bossName = null,
    logFailureMessage,
  }: {
    message: Message;
    participantIds: readonly string[];
    bossName?: string | null;
    logFailureMessage: string;
  }): Promise<void> => {
    await editMessage({
      message,
      prompt: buildWorldBossInterruptedPrompt({
        participantIds,
        bossName,
      }),
      logFailureMessage,
    });
  };

  const applyWorldBossRewards = (context: ActiveWorldBossContext): void => {
    const boss = context.worldBoss.boss;
    if (!boss) {
      return;
    }

    const rewardEligibleUserIds = Array.from(context.worldBoss.rewardEligibleUserIds);
    const participantIds = Array.from(context.worldBoss.participantIds);
    if (rewardEligibleUserIds.length < 1) {
      return;
    }

    const topDamage = Math.max(...boss.damageByUserId.values(), 0);
    const topDamageUserIds = new Set(
      Array.from(boss.damageByUserId.entries())
        .filter(([, dealtDamage]) => dealtDamage === topDamage && dealtDamage > 0)
        .map(([userId]) => userId),
    );

    unitOfWork.runInTransaction(() => {
      const achievementAnnouncements: AchievementAnnouncement[] = [];
      const awardedPipAmounts: number[] = [];

      for (const participantId of rewardEligibleUserIds) {
        const reward = economy.grantRewardPips({
          userId: participantId,
          baseAmount: boss.reward.pips,
        });
        awardedPipAmounts.push(reward.awardedAmount);
        progression.applyDiceTemporaryEffect({
          userId: participantId,
          effectCode: "roll-pass-multiplier",
          kind: "positive",
          source: `world-boss:${context.worldBoss.worldBossId}`,
          magnitude: boss.reward.rollPassMultiplier,
          remainingRolls: boss.reward.rollPassRolls,
          consumeOnCommand: "dice",
          stackGroup: "world-boss-reward-roll-pass-multiplier",
          stackMode: "refresh",
        });
        const newlyEarned = awardManualDiceAchievements(
          progression,
          participantId,
          getDiceWorldBossAchievementIds(
            recordWorldBossSuccessResolution(db, {
              userId: participantId,
              bossLevel: boss.level,
              rewardEligible: true,
              topDamage: topDamageUserIds.has(participantId),
              tourist: false,
            }),
          ),
        );
        const achievementAnnouncement = createAchievementAnnouncement(participantId, newlyEarned);
        if (achievementAnnouncement) {
          achievementAnnouncements.push(achievementAnnouncement);
        }
      }

      for (const participantId of participantIds) {
        if (context.worldBoss.rewardEligibleUserIds.has(participantId)) {
          continue;
        }

        const newlyEarned = awardManualDiceAchievements(
          progression,
          participantId,
          getDiceWorldBossAchievementIds(
            recordWorldBossSuccessResolution(db, {
              userId: participantId,
              bossLevel: boss.level,
              rewardEligible: false,
              topDamage: false,
              tourist: true,
            }),
          ),
        );
        const achievementAnnouncement = createAchievementAnnouncement(participantId, newlyEarned);
        if (achievementAnnouncement) {
          achievementAnnouncements.push(achievementAnnouncement);
        }
      }

      context.worldBoss.resolvedRewardSummary = describeAppliedWorldBossReward(
        boss.reward,
        awardedPipAmounts,
      );
      context.worldBoss.achievementAnnouncements =
        mergeAchievementAnnouncements(achievementAnnouncements);
    });
  };

  const createDoubleRollRushForWorldBoss = async (
    context: ActiveWorldBossContext,
  ): Promise<void> => {
    if (
      !isCurrentContext(context) ||
      context.worldBoss.outcome !== "success" ||
      !context.worldBoss.boss
    ) {
      return;
    }

    const announcementMessage = context.handles.announcementMessage;
    const parentChannel = await client.channels
      .fetch(announcementMessage.channelId)
      .catch((error) => {
        logger.warn("[world-boss] Failed to fetch World Boss channel for Roll Paradise.", error);
        return null;
      });

    if (
      !parentChannel ||
      !("guild" in parentChannel) ||
      !parentChannel.guild ||
      typeof parentChannel.guild.channels.create !== "function"
    ) {
      context.worldBoss.doubleRollRushFailed = true;
      return;
    }

    const expiresAt = new Date(
      (context.worldBoss.closedAtMs ?? Date.now()) + worldBossDoubleRollRushDurationMs,
    );
    const permissionOverwrites =
      "permissionOverwrites" in parentChannel &&
      parentChannel.permissionOverwrites &&
      "cache" in parentChannel.permissionOverwrites &&
      "map" in parentChannel.permissionOverwrites.cache &&
      typeof parentChannel.permissionOverwrites.cache.map === "function"
        ? parentChannel.permissionOverwrites.cache.map((overwrite) => ({
            id: overwrite.id,
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield,
            type: overwrite.type,
          }))
        : undefined;
    const rushChannel = await parentChannel.guild.channels
      .create({
        name: worldBossDoubleRollRushChannelName,
        type: ChannelType.GuildText,
        parent:
          "parentId" in parentChannel && typeof parentChannel.parentId === "string"
            ? parentChannel.parentId
            : undefined,
        permissionOverwrites,
      })
      .catch((error: unknown) => {
        logger.warn("[world-boss] Failed to create Roll Paradise channel.", error);
        return null;
      });

    if (!rushChannel || !("send" in rushChannel) || typeof rushChannel.send !== "function") {
      context.worldBoss.doubleRollRushFailed = true;
      return;
    }

    let zone: WorldBossDoubleRollRushZoneRecord;
    try {
      zone = doubleRollRushZones.createZone({
        rushId: `double-roll-rush:${randomUUID()}`,
        sourceWorldBossId: context.worldBoss.worldBossId,
        parentChannelId: announcementMessage.channelId,
        rushChannelId: rushChannel.id,
        kickoffMessageId: "pending",
        activatedAt: new Date(context.worldBoss.closedAtMs ?? Date.now()),
        expiresAt,
      });
    } catch (error) {
      logger.warn("[world-boss] Failed to persist Roll Paradise zone.", error);
      context.worldBoss.doubleRollRushFailed = true;
      await cleanupDoubleRollRushChannel({
        rushId: `cleanup:${randomUUID()}`,
        sourceWorldBossId: context.worldBoss.worldBossId,
        parentChannelId: announcementMessage.channelId,
        rushChannelId: rushChannel.id,
        kickoffMessageId: "missing",
        activatedAt: new Date(),
        expiresAt,
        closedAt: new Date(),
        closeReason: "kickoff-failed",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return;
    }

    const kickoffMessage = await sendRollParadiseKickoffMessage({
      rushChannel,
      bossName: context.worldBoss.boss.name,
      endsAtMs: expiresAt.getTime(),
    });

    if (!kickoffMessage) {
      context.worldBoss.doubleRollRushFailed = true;
      await closeDoubleRollRush({
        rushId: zone.rushId,
        closeReason: "kickoff-failed",
      });
      return;
    }

    try {
      doubleRollRushZones.updateKickoffMessageId({
        rushId: zone.rushId,
        kickoffMessageId: kickoffMessage.id,
      });
    } catch (error) {
      logger.warn("[world-boss] Failed to persist Roll Paradise kickoff message id.", error);
    }
    registerDoubleRollRush(zone);
    context.worldBoss.doubleRollRushChannelId = zone.rushChannelId;
    context.worldBoss.doubleRollRushExpiresAtMs = zone.expiresAt.getTime();
    context.worldBoss.doubleRollRushFailed = false;
  };

  const finalizeResolvedWorldBoss = async (context: ActiveWorldBossContext): Promise<void> => {
    if (!isCurrentContext(context)) {
      return;
    }

    if (context.worldBoss.outcome === "success") {
      await createDoubleRollRushForWorldBoss(context);
    }

    if (!context.handles.activeMessage) {
      transitionToTerminal(context, "cleanup-needed", {
        closedAtMs: context.worldBoss.closedAtMs ?? Date.now(),
        outcome: context.worldBoss.outcome,
      });
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cleanup-needed"],
        logFailureMessage:
          "[world-boss] Failed to update failed-resolution World Boss announcement.",
      });
      await publishAchievementEffects({
        client,
        announcements: context.worldBoss.achievementAnnouncements,
        logger,
      });
      finalizeWorldBoss(context);
      return;
    }

    const rendered = await queueActiveRenderNow({
      context,
      logFailureMessage: "[world-boss] Failed to update resolved World Boss prompt.",
    });

    if (!rendered && isCurrentContext(context) && currentWorldBossStatus(context) === "resolved") {
      transitionToTerminal(context, "cleanup-needed", {
        closedAtMs: context.worldBoss.closedAtMs ?? Date.now(),
        outcome: context.worldBoss.outcome,
      });
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cleanup-needed"],
        logFailureMessage:
          "[world-boss] Failed to update failed-resolution World Boss announcement.",
      });
      await publishAchievementEffects({
        client,
        announcements: context.worldBoss.achievementAnnouncements,
        logger,
      });
      finalizeWorldBoss(context);
      return;
    }

    await queueAnnouncementRender({
      context,
      allowedStatuses: ["resolved"],
      logFailureMessage: "[world-boss] Failed to update resolved World Boss announcement.",
    });
    await publishAchievementEffects({
      client,
      announcements: context.worldBoss.achievementAnnouncements,
      logger,
    });
    finalizeWorldBoss(context);
  };

  const resolveWorldBoss = (
    context: ActiveWorldBossContext,
    outcome: WorldBossOutcome,
    closedAtMs = Date.now(),
  ): void => {
    if (!isCurrentContext(context) || context.worldBoss.status !== "active") {
      return;
    }

    clearWorldBossTimers(context);
    transitionToTerminal(context, "resolved", {
      closedAtMs,
      outcome,
    });
    if (outcome === "success") {
      applyWorldBossRewards(context);
    }

    void queueTransition(context, async () => {
      await finalizeResolvedWorldBoss(context);
    }).catch((error) => {
      logger.warn("[world-boss] Failed to finalize resolved World Boss.", error);
    });
  };

  const runStartTransition = async (context: ActiveWorldBossContext): Promise<void> => {
    if (!isCurrentContext(context) || context.worldBoss.status !== "joining") {
      return;
    }

    clearWorldBossTimers(context);
    if (stopping) {
      return;
    }

    transitionToStarting(context);
    await queueAnnouncementRender({
      context,
      allowedStatuses: ["starting"],
      logFailureMessage: "[world-boss] Failed to close World Boss signup announcement.",
    });

    if (!isCurrentContext(context) || currentWorldBossStatus(context) !== "starting" || stopping) {
      return;
    }

    if (context.worldBoss.participantIds.size < 1) {
      transitionToTerminal(context, "cancelled");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cancelled"],
        logFailureMessage: "[world-boss] Failed to update cancelled World Boss announcement.",
      });
      finalizeWorldBoss(context);
      return;
    }

    const activeChannel = context.handles.announcementMessage.channel;
    if (!("send" in activeChannel) || typeof activeChannel.send !== "function") {
      logger.error("[world-boss] Active World Boss channel is not writable.");
      transitionToTerminal(context, "start-failed");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["start-failed"],
        logFailureMessage: "[world-boss] Failed to update failed-start World Boss announcement.",
      });
      finalizeWorldBoss(context);
      return;
    }

    const participantIds = participantIdsFromContext(context);
    const totalParticipantStrength = participantIds.reduce((strengthTotal, participantId) => {
      return (
        strengthTotal +
        calculateWorldBossParticipantStrength(progression.getActiveDicePrestige(participantId))
      );
    }, 0);
    const bossDefinition = createWorldBoss({
      raiderStrength: totalParticipantStrength,
    });

    const activeMessage = await activeChannel
      .send({
        content: "Opening World Boss thread...",
      })
      .catch((error: unknown) => {
        logger.error("[world-boss] Failed to send active World Boss prompt.", error);
        return null;
      });

    if (!activeMessage) {
      transitionToTerminal(context, "start-failed");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["start-failed"],
        logFailureMessage: "[world-boss] Failed to update failed-start World Boss announcement.",
      });
      finalizeWorldBoss(context);
      return;
    }

    const threadName = truncateDiscordText(
      `${bossDefinition.name} World Boss`,
      threadNameCharacterLimit,
    );

    const activeThread = await activeMessage
      .startThread({
        name: threadName,
        autoArchiveDuration: 60,
      })
      .catch((error: unknown) => {
        logger.error("[world-boss] Failed to open World Boss thread.", error);
        return null;
      });

    if (!activeThread) {
      await editMessage({
        message: activeMessage,
        prompt: buildWorldBossStartFailedPrompt({
          participantIds,
        }),
        logFailureMessage: "[world-boss] Failed to update failed-start active World Boss prompt.",
      });
      transitionToTerminal(context, "start-failed");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["start-failed"],
        logFailureMessage: "[world-boss] Failed to update failed-start World Boss announcement.",
      });
      finalizeWorldBoss(context);
      return;
    }

    if (!isCurrentContext(context) || currentWorldBossStatus(context) !== "starting" || stopping) {
      await closeUntrackedWorldBossMessage({
        message: activeMessage,
        participantIds,
        bossName: bossDefinition.name,
        logFailureMessage: "[world-boss] Failed to close stale active World Boss message.",
      });
      return;
    }

    const startedAtMs = Date.now();
    const expiresAtMs = startedAtMs + config.activeDurationMs;

    context.handles.activeMessage = activeMessage;
    transitionToActive(context, {
      startedAtMs,
      expiresAtMs,
      activeThreadId: activeThread.id,
      boss: {
        name: bossDefinition.name,
        level: bossDefinition.level,
        currentHp: bossDefinition.maxHp,
        maxHp: bossDefinition.maxHp,
        reward: bossDefinition.reward,
        totalDamage: 0,
        totalAttacks: 0,
        damageByUserId: new Map<string, number>(),
      },
    });

    const rendered = await queueActiveRenderNow({
      context,
      logFailureMessage: "[world-boss] Failed to render active World Boss prompt.",
    });
    if (!rendered) {
      transitionToTerminal(context, "cleanup-needed");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cleanup-needed"],
        logFailureMessage:
          "[world-boss] Failed to update failed-resolution World Boss announcement.",
      });
      finalizeWorldBoss(context);
      return;
    }

    await queueAnnouncementRender({
      context,
      allowedStatuses: ["active"],
      logFailureMessage: "[world-boss] Failed to refresh active World Boss announcement prompt.",
    });
    scheduleResolve(context);
  };

  const runFailureResolveTransition = async (context: ActiveWorldBossContext): Promise<void> => {
    if (!isCurrentContext(context) || context.worldBoss.status !== "active") {
      return;
    }

    resolveWorldBoss(context, "failure");
  };

  const runInterruptTransition = async (context: ActiveWorldBossContext): Promise<void> => {
    if (!isCurrentContext(context) || !isBlockingWorldBossStatus(context.worldBoss.status)) {
      return;
    }

    clearWorldBossTimers(context);
    transitionToTerminal(context, "interrupted");

    const interrupted = await editMessage({
      message: context.handles.activeMessage ?? context.handles.announcementMessage,
      prompt: buildWorldBossInterruptedPrompt({
        participantIds: participantIdsFromContext(context),
        bossName: context.worldBoss.boss?.name ?? null,
      }),
      logFailureMessage: "[world-boss] Failed to close World Boss during shutdown.",
    });

    if (!interrupted) {
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["interrupted"],
        logFailureMessage: "[world-boss] Failed to update interrupted World Boss announcement.",
      });
    }

    finalizeWorldBoss(context);
  };

  const triggerWorldBossNowInternal = async (): Promise<TriggerWorldBossNowOutcome> => {
    if (stopping) {
      return { created: false };
    }

    if (!config.channelId) {
      logger.warn("[world-boss] WORLD_BOSS_CHANNEL_ID not set. Skipping trigger.");
      return { created: false };
    }

    if (hasBlockingWorldBoss()) {
      return { created: false };
    }

    const channel = await client.channels.fetch(config.channelId).catch((error) => {
      logger.error("[world-boss] Failed to fetch configured World Boss channel.", error);
      return null;
    });

    if (
      !channel ||
      !channel.isTextBased() ||
      !("send" in channel) ||
      typeof channel.send !== "function"
    ) {
      logger.warn("[world-boss] Configured World Boss channel is not a writable text channel.");
      return { created: false };
    }

    if (stopping || hasBlockingWorldBoss()) {
      return { created: false };
    }

    const worldBossId = `world-boss:${randomUUID()}`;
    const scheduledStartAtMs = Date.now() + config.joinLeadMs;
    const announcementMessage = await channel
      .send(
        buildWorldBossAnnouncementPrompt({
          worldBossId,
          participantIds: [],
          scheduledStartAtMs,
        }),
      )
      .catch((error) => {
        logger.error("[world-boss] Failed to send World Boss announcement.", error);
        return null;
      });

    if (!announcementMessage) {
      return { created: false };
    }

    if (stopping || hasBlockingWorldBoss()) {
      await closeUntrackedWorldBossMessage({
        message: announcementMessage,
        participantIds: [],
        logFailureMessage: "[world-boss] Failed to close stale World Boss announcement.",
      });
      return { created: false };
    }

    const context: ActiveWorldBossContext = {
      worldBoss: {
        worldBossId,
        title: worldBossTitle,
        createdAtMs: Date.now(),
        status: "joining",
        outcome: null,
        scheduledStartAtMs,
        startedAtMs: null,
        expiresAtMs: null,
        closedAtMs: null,
        participantIds: new Set<string>(),
        joinedUserIds: new Set<string>(),
        rewardEligibleUserIds: new Set<string>(),
        resolvedRewardSummary: null,
        achievementAnnouncements: [],
        activeThreadId: null,
        doubleRollRushChannelId: null,
        doubleRollRushExpiresAtMs: null,
        doubleRollRushFailed: false,
        boss: null,
      },
      handles: {
        announcementMessage,
        activeMessage: null,
        activeRenderTimer: null,
        lastActiveRenderAtMs: 0,
        activeEditChain: Promise.resolve(),
        startTimer: null,
        resolveTimer: null,
        announcementEditChain: Promise.resolve(),
        transitionChain: Promise.resolve(),
      },
    };

    liveWorldBossesById.set(worldBossId, context);
    scheduleStart(context);

    return {
      created: true,
      worldBossId,
      scheduledStartAt: new Date(scheduledStartAtMs),
    };
  };

  const triggerWorldBossNow = async (): Promise<TriggerWorldBossNowOutcome> => {
    let result: TriggerWorldBossNowOutcome = { created: false };

    triggerChain = triggerChain
      .catch(() => {})
      .then(async () => {
        result = await triggerWorldBossNowInternal();
      });

    await triggerChain;
    return result;
  };

  const handleButtonInteraction = async (interaction: ButtonInteraction): Promise<void> => {
    const joinWorldBossId = parseWorldBossJoinButtonId(interaction.customId);
    const leaveWorldBossId = parseWorldBossLeaveButtonId(interaction.customId);
    const buttonAction =
      joinWorldBossId !== null
        ? { type: "join" as const, worldBossId: joinWorldBossId }
        : leaveWorldBossId !== null
          ? { type: "leave" as const, worldBossId: leaveWorldBossId }
          : null;
    if (!buttonAction) {
      await interaction.deferUpdate();
      return;
    }

    const context = liveWorldBossesById.get(buttonAction.worldBossId);
    if (
      !context ||
      stopping ||
      context.worldBoss.status !== "joining" ||
      Date.now() >= context.worldBoss.scheduledStartAtMs
    ) {
      await interaction.reply({
        content: "Too late - this World Boss is already closed.",
        ephemeral: true,
      });
      return;
    }

    if (buttonAction.type === "leave") {
      if (!context.worldBoss.participantIds.has(interaction.user.id)) {
        await interaction.reply({
          content: "You're not signed up for this World Boss.",
          ephemeral: true,
        });
        return;
      }

      context.worldBoss.participantIds.delete(interaction.user.id);
      await interaction.deferUpdate();
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["joining"],
        logFailureMessage: "[world-boss] Failed to refresh World Boss announcement prompt.",
      });
      return;
    }

    if (context.worldBoss.participantIds.has(interaction.user.id)) {
      await interaction.reply({
        content: "You're already signed up for this World Boss.",
        ephemeral: true,
      });
      return;
    }

    context.worldBoss.participantIds.add(interaction.user.id);
    const isFirstWorldBossJoin = !context.worldBoss.joinedUserIds.has(interaction.user.id);
    context.worldBoss.joinedUserIds.add(interaction.user.id);
    const contractProgress = isFirstWorldBossJoin
      ? recordWorldBossJoinContractProgressSafely({
          contracts,
          logger,
          userId: interaction.user.id,
        })
      : null;
    const achievementAnnouncements = isFirstWorldBossJoin
      ? [
          createAchievementAnnouncement(
            interaction.user.id,
            awardManualDiceAchievements(
              progression,
              interaction.user.id,
              getDiceWorldBossAchievementIds(recordWorldBossJoin(db, interaction.user.id)),
            ),
          ),
        ].flatMap((announcement) => (announcement ? [announcement] : []))
      : [];
    await interaction.deferUpdate();
    await queueAnnouncementRender({
      context,
      allowedStatuses: ["joining"],
      logFailureMessage: "[world-boss] Failed to refresh World Boss announcement prompt.",
    });
    await publishAchievementEffects({
      client,
      announcements: achievementAnnouncements,
      logger,
    });
    await publishContractCompletionAnnouncements({
      client,
      announcements: contractProgress?.contractCompletionAnnouncements ?? [],
      logger,
    });
  };

  const applyDiceRoll = ({
    channelId,
    userId,
    userMention,
    damage,
    bestRollSet = null,
    nowMs = Date.now(),
  }: ApplyWorldBossDiceRollInput): ApplyWorldBossDiceRollResult => {
    if (!channelId || damage <= 0) {
      return { kind: "no-world-boss" };
    }

    const worldBossId = liveWorldBossIdsByThreadId.get(channelId);
    if (!worldBossId) {
      return { kind: "no-world-boss" };
    }

    const context = liveWorldBossesById.get(worldBossId);
    if (!context || context.worldBoss.activeThreadId !== channelId) {
      return { kind: "no-world-boss" };
    }

    if (stopping || context.worldBoss.status !== "active" || !context.worldBoss.boss) {
      return {
        kind: "ignored",
        reason: "inactive",
        summary: "Too late - this World Boss is no longer active.",
      };
    }

    if ((context.worldBoss.expiresAtMs ?? 0) <= nowMs) {
      resolveWorldBoss(context, "failure", nowMs);
      return {
        kind: "ignored",
        reason: "inactive",
        summary: "Too late - the World Boss timer already ended.",
      };
    }

    if (!context.worldBoss.participantIds.has(userId)) {
      return {
        kind: "ignored",
        reason: "not-joined",
        summary: `${userMention}, this roll did not hit the boss because you did not join before the World Boss started.`,
      };
    }

    context.worldBoss.boss.currentHp = Math.max(0, context.worldBoss.boss.currentHp - damage);
    context.worldBoss.boss.totalDamage += damage;
    context.worldBoss.boss.totalAttacks += 1;
    context.worldBoss.boss.damageByUserId.set(
      userId,
      (context.worldBoss.boss.damageByUserId.get(userId) ?? 0) + damage,
    );
    context.worldBoss.rewardEligibleUserIds.add(userId);
    const hitAchievements = awardManualDiceAchievements(
      progression,
      userId,
      getDiceWorldBossAchievementIds(recordWorldBossHit(db, { userId, damage })),
    );
    const achievementAnnouncements = [
      createAchievementAnnouncement(userId, hitAchievements),
    ].flatMap((announcement) => (announcement ? [announcement] : []));

    const boss = context.worldBoss.boss;
    if (boss.currentHp <= 0) {
      const killShotAchievements = awardManualDiceAchievements(progression, userId, [
        "world-boss-kill-shot",
      ]);
      achievementAnnouncements.push(
        ...[createAchievementAnnouncement(userId, killShotAchievements)].flatMap((announcement) =>
          announcement ? [announcement] : [],
        ),
      );
      resolveWorldBoss(context, "success", nowMs);
      const rewardSummary =
        context.worldBoss.resolvedRewardSummary ?? describeWorldBossReward(boss.reward);
      const eligibleParticipantCount = context.worldBoss.rewardEligibleUserIds.size;
      return {
        kind: "applied",
        defeated: true,
        summary: buildWorldBossHitSummary({
          damage,
          bossName: boss.name,
          bestRollSet,
          defeated: true,
          rewardSummary,
          eligibleParticipantCount,
        }),
        achievementAnnouncements,
      };
    }

    scheduleActiveRender(
      context,
      "[world-boss] Failed to refresh active World Boss progress prompt.",
    );
    return {
      kind: "applied",
      defeated: false,
      summary: buildWorldBossHitSummary({
        damage,
        bossName: boss.name,
        bestRollSet,
        defeated: false,
        currentHp: boss.currentHp,
        maxHp: boss.maxHp,
      }),
      achievementAnnouncements,
    };
  };

  const getLiveWorldBossesSnapshot = (): WorldBossAdminLiveSnapshot[] => {
    return Array.from(liveWorldBossesById.values())
      .map(buildLiveWorldBossSnapshot)
      .sort((left, right) => left.scheduledStartAt.getTime() - right.scheduledStartAt.getTime());
  };

  const getActiveDoubleRollRushStatus = ({
    channelId,
    nowMs = Date.now(),
  }: GetWorldBossDoubleRollRushStatusInput): WorldBossDoubleRollRushStatus => {
    const zone = doubleRollRushZones.getActiveZoneByChannelId({
      channelId,
      now: new Date(nowMs),
    });
    if (!zone) {
      return doubleRollRushInactiveStatus;
    }

    return {
      isActive: true,
      expiresAtMs: zone.expiresAt.getTime(),
    };
  };

  const recoverDoubleRollRushesOnStartup = async ({
    now = new Date(),
  }: {
    now?: Date;
  } = {}): Promise<{
    resumedCount: number;
    expiredCount: number;
    invalidCount: number;
  }> => {
    const summary = {
      resumedCount: 0,
      expiredCount: 0,
      invalidCount: 0,
    };

    const pendingCleanupZones = doubleRollRushZones.listCleanupPendingZones();
    const expiredZones = doubleRollRushZones.closeExpiredZones(now);
    summary.expiredCount = expiredZones.length;
    await Promise.allSettled(
      expiredZones.map((zone) => reconcileClosedDoubleRollRushCleanup(zone, now)),
    );
    const expiredZoneIds = new Set(expiredZones.map((zone) => zone.rushId));
    await Promise.allSettled(
      pendingCleanupZones
        .filter((zone) => !expiredZoneIds.has(zone.rushId))
        .map((zone) => reconcileClosedDoubleRollRushCleanup(zone, now)),
    );

    const openZones = doubleRollRushZones.listOpenZones({
      now,
    });
    for (const zone of openZones) {
      const fetchedChannel = await client.channels
        .fetch(zone.rushChannelId)
        .then((channel) => ({
          kind: "resolved" as const,
          channel,
        }))
        .catch((error) => {
          logger.warn("[world-boss] Failed to fetch Roll Paradise channel during recovery.", error);
          return {
            kind: "failed" as const,
          };
        });
      if (fetchedChannel.kind === "failed") {
        registerDoubleRollRush(zone);
        summary.resumedCount += 1;
        continue;
      }

      if (!fetchedChannel.channel) {
        await closeDoubleRollRush({
          rushId: zone.rushId,
          closeReason: "missing-channel",
          now,
          cleanupChannel: false,
        });
        summary.invalidCount += 1;
        continue;
      }

      registerDoubleRollRush(zone);
      summary.resumedCount += 1;
    }

    return summary;
  };

  const hasBlockingWorldBoss = (): boolean => {
    return Array.from(liveWorldBossesById.values()).some((context) =>
      isBlockingWorldBossStatus(context.worldBoss.status),
    );
  };

  const stop = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    await triggerChain.catch(() => {});

    const liveWorldBosses = Array.from(liveWorldBossesById.values());
    for (const context of liveWorldBosses) {
      clearWorldBossTimers(context);
    }
    for (const rushContext of activeDoubleRollRushesById.values()) {
      clearDoubleRollRushTimer(rushContext);
    }

    await Promise.allSettled(
      liveWorldBosses.map((context) =>
        queueTransition(context, async () => {
          await runInterruptTransition(context);
        }),
      ),
    );
  };

  return {
    triggerWorldBossNow,
    handleButtonInteraction,
    applyDiceRoll,
    getActiveDoubleRollRushStatus,
    getLiveWorldBossesSnapshot,
    recoverDoubleRollRushesOnStartup,
    hasBlockingWorldBoss,
    stop,
  };
};
