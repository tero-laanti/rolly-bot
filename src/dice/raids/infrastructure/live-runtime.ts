import { randomUUID } from "node:crypto";
import type { BaseMessageOptions, ButtonInteraction, Client, Message } from "discord.js";
import type { RaidsConfig } from "../../../shared/config";
import { getDatabase } from "../../../shared/db";
import { createSqliteUnitOfWork } from "../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteEconomyRepository } from "../../economy/infrastructure/sqlite/balance-repository";
import { awardManualDiceAchievements } from "../../progression/application/achievement-awards";
import {
  appendAchievementUnlockText,
  formatAchievementUnlockText,
} from "../../progression/application/achievement-text";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";
import type {
  ApplyRaidDiceRollInput,
  ApplyRaidDiceRollResult,
  RaidAdminLiveRaidSnapshot,
  RaidBossSnapshot,
  RaidOutcome,
  RaidStatus,
  TriggerRaidNowOutcome,
} from "../application/ports";
import { getDiceRaidAchievementIds } from "../application/achievement-rules";
import { createRaidBoss, describeRaidReward } from "../domain/raid";
import { parseRaidJoinButtonId } from "../interfaces/discord/button-ids";
import {
  buildRaidActivePrompt,
  buildRaidAnnouncementPrompt,
  buildRaidCancelledPrompt,
  buildRaidInterruptedPrompt,
  buildRaidResolveFailedPrompt,
  buildRaidResolvedPrompt,
  buildRaidStartFailedPrompt,
} from "../interfaces/discord/prompt";
import type {
  ActiveRaidContext,
  ActiveRaidRecord,
  RaidsLiveRuntimeLogger,
} from "./live-runtime-types";
import {
  recordRaidHit,
  recordRaidJoin,
  recordRaidSuccessResolution,
} from "./achievement-stats-repository";

type CreateRaidsLiveRuntimeInput = {
  client: Client;
  config: RaidsConfig;
  logger?: RaidsLiveRuntimeLogger;
};

type QueueAnnouncementRenderInput = {
  context: ActiveRaidContext;
  logFailureMessage: string;
  allowedStatuses?: readonly RaidStatus[];
};

export type RaidsLiveRuntime = {
  triggerRaidNow: () => Promise<TriggerRaidNowOutcome>;
  handleButtonInteraction: (interaction: ButtonInteraction) => Promise<void>;
  applyDiceRoll: (input: ApplyRaidDiceRollInput) => ApplyRaidDiceRollResult;
  getLiveRaidsSnapshot: () => RaidAdminLiveRaidSnapshot[];
  hasBlockingRaid: () => boolean;
  stop: () => Promise<void>;
};

const raidTitle = "Dice raid";
const raidProgressRenderThrottleMs = 1_500;
const maxContributionLines = 5;

const blockingStatuses = new Set<RaidStatus>(["joining", "starting", "active"]);

const isBlockingRaidStatus = (status: RaidStatus): boolean => {
  return blockingStatuses.has(status);
};

const participantIdsFromContext = (context: ActiveRaidContext): string[] => {
  return Array.from(context.raid.participantIds);
};

const currentRaidStatus = (context: ActiveRaidContext): RaidStatus => {
  return context.raid.status;
};

const buildRaidBossSnapshot = (context: ActiveRaidContext): RaidBossSnapshot | null => {
  if (!context.raid.boss) {
    return null;
  }

  return {
    name: context.raid.boss.name,
    level: context.raid.boss.level,
    currentHp: context.raid.boss.currentHp,
    maxHp: context.raid.boss.maxHp,
    rewardSummary: describeRaidReward(context.raid.boss.reward),
  };
};

const buildContributionLines = (context: ActiveRaidContext): string[] => {
  if (!context.raid.boss) {
    return [];
  }

  return Array.from(context.raid.boss.damageByUserId.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxContributionLines)
    .map(([userId, damage]) => `<@${userId}> - ${damage} dmg`);
};

const formatRaidAchievementLine = (userId: string, achievementIds: readonly string[]): string => {
  const achievementText = formatAchievementUnlockText(achievementIds);
  return achievementText ? `<@${userId}>: ${achievementText}` : "";
};

export const createRaidsLiveRuntime = ({
  client,
  config,
  logger = console,
}: CreateRaidsLiveRuntimeInput): RaidsLiveRuntime => {
  const liveRaidsById = new Map<string, ActiveRaidContext>();
  const liveRaidIdsByThreadId = new Map<string, string>();
  const db = getDatabase();
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const unitOfWork = createSqliteUnitOfWork(db);
  let stopping = false;
  let triggerChain: Promise<void> = Promise.resolve();

  const isCurrentContext = (context: ActiveRaidContext): boolean => {
    return liveRaidsById.get(context.raid.raidId) === context;
  };

  const clearRaidTimers = (context: ActiveRaidContext): void => {
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

  const finalizeRaid = (context: ActiveRaidContext): void => {
    clearRaidTimers(context);
    if (!isCurrentContext(context)) {
      return;
    }

    if (context.raid.activeThreadId) {
      liveRaidIdsByThreadId.delete(context.raid.activeThreadId);
    }

    liveRaidsById.delete(context.raid.raidId);
  };

  const buildLiveRaidSnapshot = (context: ActiveRaidContext): RaidAdminLiveRaidSnapshot => {
    return {
      raidId: context.raid.raidId,
      title: context.raid.title,
      status: context.raid.status,
      outcome: context.raid.outcome,
      participantCount: context.raid.participantIds.size,
      eligibleParticipantCount: context.raid.rewardEligibleUserIds.size,
      scheduledStartAt: new Date(context.raid.scheduledStartAtMs),
      expiresAt: context.raid.expiresAtMs === null ? null : new Date(context.raid.expiresAtMs),
      channelId: context.handles.announcementMessage.channelId,
      announcementMessageId: context.handles.announcementMessage.id,
      activeMessageId: context.handles.activeMessage?.id ?? null,
      activeThreadId: context.raid.activeThreadId,
      boss: buildRaidBossSnapshot(context),
    };
  };

  const buildAnnouncementPromptForCurrentState = (
    context: ActiveRaidContext,
  ): BaseMessageOptions => {
    const participantIds = participantIdsFromContext(context);
    const boss = context.raid.boss;

    switch (context.raid.status) {
      case "joining":
        return buildRaidAnnouncementPrompt({
          raidId: context.raid.raidId,
          participantIds,
          scheduledStartAtMs: context.raid.scheduledStartAtMs,
        });
      case "starting":
      case "active":
        return buildRaidAnnouncementPrompt({
          raidId: context.raid.raidId,
          participantIds,
          scheduledStartAtMs: context.raid.scheduledStartAtMs,
          disabled: true,
          bossName: boss?.name ?? null,
          threadId: context.raid.activeThreadId,
        });
      case "cancelled":
        return buildRaidCancelledPrompt({
          scheduledStartAtMs: context.raid.scheduledStartAtMs,
        });
      case "interrupted":
        return buildRaidInterruptedPrompt({
          participantIds,
          bossName: boss?.name ?? null,
        });
      case "start-failed":
        return buildRaidStartFailedPrompt({
          participantIds,
        });
      case "resolved":
        if (boss && context.raid.outcome) {
          return buildRaidResolvedPrompt({
            participantIds,
            eligibleParticipantCount: context.raid.rewardEligibleUserIds.size,
            resolvedAtMs: context.raid.closedAtMs ?? Date.now(),
            outcome: context.raid.outcome,
            bossName: boss.name,
            bossLevel: boss.level,
            maxHp: boss.maxHp,
            rewardSummary: describeRaidReward(boss.reward),
            achievementLines: context.raid.achievementLines,
            contributionLines: buildContributionLines(context),
          });
        }

        return buildRaidInterruptedPrompt({
          participantIds,
        });
      case "cleanup-needed":
        return buildRaidResolveFailedPrompt({
          participantIds,
          resolvedAtMs: context.raid.closedAtMs ?? Date.now(),
          bossName: boss?.name ?? null,
          outcome: context.raid.outcome,
        });
    }
  };

  const buildActivePromptForCurrentState = (context: ActiveRaidContext): BaseMessageOptions => {
    const participantIds = participantIdsFromContext(context);
    const boss = context.raid.boss;

    switch (context.raid.status) {
      case "active":
        if (!boss || !context.raid.activeThreadId) {
          return buildRaidInterruptedPrompt({
            participantIds,
            bossName: boss?.name ?? null,
          });
        }

        return buildRaidActivePrompt({
          participantIds,
          eligibleParticipantCount: context.raid.rewardEligibleUserIds.size,
          startedAtMs: context.raid.startedAtMs ?? Date.now(),
          endsAtMs: context.raid.expiresAtMs ?? Date.now(),
          threadId: context.raid.activeThreadId,
          bossName: boss.name,
          bossLevel: boss.level,
          currentHp: boss.currentHp,
          maxHp: boss.maxHp,
          rewardSummary: describeRaidReward(boss.reward),
          totalDamage: boss.totalDamage,
          totalAttacks: boss.totalAttacks,
          contributionLines: buildContributionLines(context),
        });
      case "resolved":
        if (boss && context.raid.outcome) {
          return buildRaidResolvedPrompt({
            participantIds,
            eligibleParticipantCount: context.raid.rewardEligibleUserIds.size,
            resolvedAtMs: context.raid.closedAtMs ?? Date.now(),
            outcome: context.raid.outcome,
            bossName: boss.name,
            bossLevel: boss.level,
            maxHp: boss.maxHp,
            rewardSummary: describeRaidReward(boss.reward),
            achievementLines: context.raid.achievementLines,
            contributionLines: buildContributionLines(context),
          });
        }

        return buildRaidInterruptedPrompt({
          participantIds,
          bossName: boss?.name ?? null,
        });
      case "interrupted":
        return buildRaidInterruptedPrompt({
          participantIds,
          bossName: boss?.name ?? null,
        });
      case "start-failed":
        return buildRaidStartFailedPrompt({
          participantIds,
        });
      default:
        return buildRaidInterruptedPrompt({
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

        if (allowedStatuses && !allowedStatuses.includes(context.raid.status)) {
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
    context: ActiveRaidContext;
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

  const scheduleActiveRender = (context: ActiveRaidContext, logFailureMessage: string): void => {
    if (!context.handles.activeMessage || currentRaidStatus(context) !== "active") {
      return;
    }

    if (context.handles.activeRenderTimer) {
      return;
    }

    const elapsedMs = Date.now() - context.handles.lastActiveRenderAtMs;
    const delayMs = Math.max(0, raidProgressRenderThrottleMs - elapsedMs);

    context.handles.activeRenderTimer = setTimeout(() => {
      context.handles.activeRenderTimer = null;
      void queueActiveRenderNow({
        context,
        logFailureMessage,
      });
    }, delayMs);
  };

  const queueTransition = async (
    context: ActiveRaidContext,
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

  const scheduleStart = (context: ActiveRaidContext): void => {
    const delayMs = Math.max(0, context.raid.scheduledStartAtMs - Date.now());
    context.handles.startTimer = setTimeout(() => {
      void queueTransition(context, async () => {
        await runStartTransition(context);
      }).catch((error) => {
        logger.warn("[raids] Failed to transition raid into active state.", error);
      });
    }, delayMs);
  };

  const scheduleResolve = (context: ActiveRaidContext): void => {
    const delayMs = Math.max(0, (context.raid.expiresAtMs ?? Date.now()) - Date.now());
    context.handles.resolveTimer = setTimeout(() => {
      void queueTransition(context, async () => {
        await runFailureResolveTransition(context);
      }).catch((error) => {
        logger.warn("[raids] Failed to resolve raid lifecycle.", error);
      });
    }, delayMs);
  };

  const transitionToStarting = (context: ActiveRaidContext): void => {
    context.raid.status = "starting";
    context.raid.outcome = null;
    context.raid.startedAtMs = null;
    context.raid.expiresAtMs = null;
    context.raid.closedAtMs = null;
    context.raid.activeThreadId = null;
    context.raid.rewardEligibleUserIds.clear();
    context.raid.boss = null;
  };

  const transitionToActive = (
    context: ActiveRaidContext,
    {
      startedAtMs,
      expiresAtMs,
      activeThreadId,
      boss,
    }: {
      startedAtMs: number;
      expiresAtMs: number;
      activeThreadId: string;
      boss: NonNullable<ActiveRaidRecord["boss"]>;
    },
  ): void => {
    context.raid.status = "active";
    context.raid.outcome = null;
    context.raid.startedAtMs = startedAtMs;
    context.raid.expiresAtMs = expiresAtMs;
    context.raid.closedAtMs = null;
    context.raid.activeThreadId = activeThreadId;
    context.raid.rewardEligibleUserIds.clear();
    context.raid.boss = boss;
    liveRaidIdsByThreadId.set(activeThreadId, context.raid.raidId);
  };

  const transitionToTerminal = (
    context: ActiveRaidContext,
    status: Extract<
      RaidStatus,
      "cancelled" | "interrupted" | "start-failed" | "resolved" | "cleanup-needed"
    >,
    {
      closedAtMs = Date.now(),
      outcome = null,
    }: {
      closedAtMs?: number;
      outcome?: RaidOutcome | null;
    } = {},
  ): void => {
    context.raid.status = status;
    context.raid.outcome = outcome;
    context.raid.expiresAtMs = null;
    context.raid.closedAtMs = closedAtMs;
  };

  const closeUntrackedRaidMessage = async ({
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
      prompt: buildRaidInterruptedPrompt({
        participantIds,
        bossName,
      }),
      logFailureMessage,
    });
  };

  const buildParticipantProfiles = (participantIds: readonly string[]) => {
    return participantIds.map((participantId) => ({
      userId: participantId,
      level: progression.getDiceLevel(participantId),
      prestige: progression.getActiveDicePrestige(participantId),
      dieSides: progression.getDiceSides(participantId),
    }));
  };

  const applyRaidRewards = (context: ActiveRaidContext): void => {
    const boss = context.raid.boss;
    if (!boss) {
      return;
    }

    const rewardEligibleUserIds = Array.from(context.raid.rewardEligibleUserIds);
    const participantIds = Array.from(context.raid.participantIds);
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
      const achievementLines: string[] = [];

      for (const participantId of rewardEligibleUserIds) {
        economy.applyPipsDelta({
          userId: participantId,
          amount: boss.reward.pips,
        });
        progression.applyDiceTemporaryEffect({
          userId: participantId,
          effectCode: "roll-pass-multiplier",
          kind: "positive",
          source: `raid:${context.raid.raidId}`,
          magnitude: boss.reward.rollPassMultiplier,
          remainingRolls: boss.reward.rollPassRolls,
          consumeOnCommand: "dice",
          stackGroup: "raid-reward-roll-pass-multiplier",
          stackMode: "refresh",
        });
        const newlyEarned = awardManualDiceAchievements(
          progression,
          participantId,
          getDiceRaidAchievementIds(
            recordRaidSuccessResolution(db, {
              userId: participantId,
              bossLevel: boss.level,
              rewardEligible: true,
              topDamage: topDamageUserIds.has(participantId),
              tourist: false,
            }),
          ),
        );
        const achievementLine = formatRaidAchievementLine(participantId, newlyEarned);
        if (achievementLine) {
          achievementLines.push(achievementLine);
        }
      }

      for (const participantId of participantIds) {
        if (context.raid.rewardEligibleUserIds.has(participantId)) {
          continue;
        }

        const newlyEarned = awardManualDiceAchievements(
          progression,
          participantId,
          getDiceRaidAchievementIds(
            recordRaidSuccessResolution(db, {
              userId: participantId,
              bossLevel: boss.level,
              rewardEligible: false,
              topDamage: false,
              tourist: true,
            }),
          ),
        );
        const achievementLine = formatRaidAchievementLine(participantId, newlyEarned);
        if (achievementLine) {
          achievementLines.push(achievementLine);
        }
      }

      context.raid.achievementLines = achievementLines;
    });
  };

  const finalizeResolvedRaid = async (context: ActiveRaidContext): Promise<void> => {
    if (!isCurrentContext(context)) {
      return;
    }

    if (!context.handles.activeMessage) {
      transitionToTerminal(context, "cleanup-needed", {
        closedAtMs: context.raid.closedAtMs ?? Date.now(),
        outcome: context.raid.outcome,
      });
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cleanup-needed"],
        logFailureMessage: "[raids] Failed to update failed-resolution raid announcement.",
      });
      finalizeRaid(context);
      return;
    }

    const rendered = await queueActiveRenderNow({
      context,
      logFailureMessage: "[raids] Failed to update resolved raid prompt.",
    });

    if (!rendered && isCurrentContext(context) && currentRaidStatus(context) === "resolved") {
      transitionToTerminal(context, "cleanup-needed", {
        closedAtMs: context.raid.closedAtMs ?? Date.now(),
        outcome: context.raid.outcome,
      });
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cleanup-needed"],
        logFailureMessage: "[raids] Failed to update failed-resolution raid announcement.",
      });
      finalizeRaid(context);
      return;
    }

    await queueAnnouncementRender({
      context,
      allowedStatuses: ["resolved"],
      logFailureMessage: "[raids] Failed to update resolved raid announcement.",
    });
    finalizeRaid(context);
  };

  const resolveRaid = (
    context: ActiveRaidContext,
    outcome: RaidOutcome,
    closedAtMs = Date.now(),
  ): void => {
    if (!isCurrentContext(context) || context.raid.status !== "active") {
      return;
    }

    clearRaidTimers(context);
    transitionToTerminal(context, "resolved", {
      closedAtMs,
      outcome,
    });
    if (outcome === "success") {
      applyRaidRewards(context);
    }

    void queueTransition(context, async () => {
      await finalizeResolvedRaid(context);
    }).catch((error) => {
      logger.warn("[raids] Failed to finalize resolved raid.", error);
    });
  };

  const runStartTransition = async (context: ActiveRaidContext): Promise<void> => {
    if (!isCurrentContext(context) || context.raid.status !== "joining") {
      return;
    }

    clearRaidTimers(context);
    if (stopping) {
      return;
    }

    transitionToStarting(context);
    await queueAnnouncementRender({
      context,
      allowedStatuses: ["starting"],
      logFailureMessage: "[raids] Failed to close raid signup announcement.",
    });

    if (!isCurrentContext(context) || currentRaidStatus(context) !== "starting" || stopping) {
      return;
    }

    if (context.raid.participantIds.size < 1) {
      transitionToTerminal(context, "cancelled");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cancelled"],
        logFailureMessage: "[raids] Failed to update cancelled raid announcement.",
      });
      finalizeRaid(context);
      return;
    }

    const activeChannel = context.handles.announcementMessage.channel;
    if (!("send" in activeChannel) || typeof activeChannel.send !== "function") {
      logger.error("[raids] Active raid channel is not writable.");
      transitionToTerminal(context, "start-failed");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["start-failed"],
        logFailureMessage: "[raids] Failed to update failed-start raid announcement.",
      });
      finalizeRaid(context);
      return;
    }

    const participantIds = participantIdsFromContext(context);
    const bossDefinition = createRaidBoss({
      participantProfiles: buildParticipantProfiles(participantIds),
      activeDurationMs: config.activeDurationMs,
    });

    const activeMessage = await activeChannel
      .send({
        content: "Opening raid thread...",
      })
      .catch((error: unknown) => {
        logger.error("[raids] Failed to send active raid prompt.", error);
        return null;
      });

    if (!activeMessage) {
      transitionToTerminal(context, "start-failed");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["start-failed"],
        logFailureMessage: "[raids] Failed to update failed-start raid announcement.",
      });
      finalizeRaid(context);
      return;
    }

    const activeThread = await activeMessage
      .startThread({
        name: `${bossDefinition.name} raid`,
        autoArchiveDuration: 60,
      })
      .catch((error: unknown) => {
        logger.error("[raids] Failed to open raid thread.", error);
        return null;
      });

    if (!activeThread) {
      await editMessage({
        message: activeMessage,
        prompt: buildRaidStartFailedPrompt({
          participantIds,
        }),
        logFailureMessage: "[raids] Failed to update failed-start active raid prompt.",
      });
      transitionToTerminal(context, "start-failed");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["start-failed"],
        logFailureMessage: "[raids] Failed to update failed-start raid announcement.",
      });
      finalizeRaid(context);
      return;
    }

    if (!isCurrentContext(context) || currentRaidStatus(context) !== "starting" || stopping) {
      await closeUntrackedRaidMessage({
        message: activeMessage,
        participantIds,
        bossName: bossDefinition.name,
        logFailureMessage: "[raids] Failed to close stale active raid message.",
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
      logFailureMessage: "[raids] Failed to render active raid prompt.",
    });
    if (!rendered) {
      transitionToTerminal(context, "cleanup-needed");
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cleanup-needed"],
        logFailureMessage: "[raids] Failed to update failed-resolution raid announcement.",
      });
      finalizeRaid(context);
      return;
    }

    await queueAnnouncementRender({
      context,
      allowedStatuses: ["active"],
      logFailureMessage: "[raids] Failed to refresh active raid announcement prompt.",
    });
    scheduleResolve(context);
  };

  const runFailureResolveTransition = async (context: ActiveRaidContext): Promise<void> => {
    if (!isCurrentContext(context) || context.raid.status !== "active") {
      return;
    }

    resolveRaid(context, "failure");
  };

  const runInterruptTransition = async (context: ActiveRaidContext): Promise<void> => {
    if (!isCurrentContext(context) || !isBlockingRaidStatus(context.raid.status)) {
      return;
    }

    clearRaidTimers(context);
    transitionToTerminal(context, "interrupted");

    const interrupted = await editMessage({
      message: context.handles.activeMessage ?? context.handles.announcementMessage,
      prompt: buildRaidInterruptedPrompt({
        participantIds: participantIdsFromContext(context),
        bossName: context.raid.boss?.name ?? null,
      }),
      logFailureMessage: "[raids] Failed to close raid during shutdown.",
    });

    if (!interrupted) {
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["interrupted"],
        logFailureMessage: "[raids] Failed to update interrupted raid announcement.",
      });
    }

    finalizeRaid(context);
  };

  const triggerRaidNowInternal = async (): Promise<TriggerRaidNowOutcome> => {
    if (stopping) {
      return { created: false };
    }

    if (!config.channelId) {
      logger.warn("[raids] RAIDS_CHANNEL_ID not set. Skipping trigger.");
      return { created: false };
    }

    if (hasBlockingRaid()) {
      return { created: false };
    }

    const channel = await client.channels.fetch(config.channelId).catch((error) => {
      logger.error("[raids] Failed to fetch configured raid channel.", error);
      return null;
    });

    if (
      !channel ||
      !channel.isTextBased() ||
      !("send" in channel) ||
      typeof channel.send !== "function"
    ) {
      logger.warn("[raids] Configured raid channel is not writable text channel.");
      return { created: false };
    }

    if (stopping || hasBlockingRaid()) {
      return { created: false };
    }

    const raidId = `raid:${randomUUID()}`;
    const scheduledStartAtMs = Date.now() + config.joinLeadMs;
    const announcementMessage = await channel
      .send(
        buildRaidAnnouncementPrompt({
          raidId,
          participantIds: [],
          scheduledStartAtMs,
        }),
      )
      .catch((error) => {
        logger.error("[raids] Failed to send raid announcement.", error);
        return null;
      });

    if (!announcementMessage) {
      return { created: false };
    }

    if (stopping || hasBlockingRaid()) {
      await closeUntrackedRaidMessage({
        message: announcementMessage,
        participantIds: [],
        logFailureMessage: "[raids] Failed to close stale raid announcement.",
      });
      return { created: false };
    }

    const context: ActiveRaidContext = {
      raid: {
        raidId,
        title: raidTitle,
        createdAtMs: Date.now(),
        status: "joining",
        outcome: null,
        scheduledStartAtMs,
        startedAtMs: null,
        expiresAtMs: null,
        closedAtMs: null,
        participantIds: new Set<string>(),
        rewardEligibleUserIds: new Set<string>(),
        achievementLines: [],
        activeThreadId: null,
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

    liveRaidsById.set(raidId, context);
    scheduleStart(context);

    return {
      created: true,
      raidId,
      scheduledStartAt: new Date(scheduledStartAtMs),
    };
  };

  const triggerRaidNow = async (): Promise<TriggerRaidNowOutcome> => {
    let result: TriggerRaidNowOutcome = { created: false };

    triggerChain = triggerChain
      .catch(() => {})
      .then(async () => {
        result = await triggerRaidNowInternal();
      });

    await triggerChain;
    return result;
  };

  const handleButtonInteraction = async (interaction: ButtonInteraction): Promise<void> => {
    const raidId = parseRaidJoinButtonId(interaction.customId);
    if (!raidId) {
      await interaction.deferUpdate();
      return;
    }

    const context = liveRaidsById.get(raidId);
    if (
      !context ||
      stopping ||
      context.raid.status !== "joining" ||
      Date.now() >= context.raid.scheduledStartAtMs
    ) {
      await interaction.reply({
        content: "Too late - this raid is already closed.",
        ephemeral: true,
      });
      return;
    }

    if (context.raid.participantIds.has(interaction.user.id)) {
      await interaction.reply({
        content: "You're already signed up for this raid.",
        ephemeral: true,
      });
      return;
    }

    context.raid.participantIds.add(interaction.user.id);
    const newlyEarned = awardManualDiceAchievements(
      progression,
      interaction.user.id,
      getDiceRaidAchievementIds(recordRaidJoin(db, interaction.user.id)),
    );
    await interaction.deferUpdate();
    const achievementText = formatAchievementUnlockText(newlyEarned);
    if (achievementText) {
      await interaction.followUp({
        content: achievementText,
        ephemeral: true,
      });
    }
    await queueAnnouncementRender({
      context,
      allowedStatuses: ["joining"],
      logFailureMessage: "[raids] Failed to refresh raid announcement prompt.",
    });
  };

  const applyDiceRoll = ({
    channelId,
    userId,
    userMention,
    damage,
    nowMs = Date.now(),
  }: ApplyRaidDiceRollInput): ApplyRaidDiceRollResult => {
    if (!channelId || damage <= 0) {
      return { kind: "no-raid" };
    }

    const raidId = liveRaidIdsByThreadId.get(channelId);
    if (!raidId) {
      return { kind: "no-raid" };
    }

    const context = liveRaidsById.get(raidId);
    if (!context || context.raid.activeThreadId !== channelId) {
      return { kind: "no-raid" };
    }

    if (stopping || context.raid.status !== "active" || !context.raid.boss) {
      return {
        kind: "ignored",
        reason: "inactive",
        summary: "Too late - this raid is no longer active.",
      };
    }

    if ((context.raid.expiresAtMs ?? 0) <= nowMs) {
      resolveRaid(context, "failure", nowMs);
      return {
        kind: "ignored",
        reason: "inactive",
        summary: "Too late - the raid timer already ended.",
      };
    }

    if (!context.raid.participantIds.has(userId)) {
      return {
        kind: "ignored",
        reason: "not-joined",
        summary: `${userMention}, this roll did not hit the boss because you did not join before the raid started.`,
      };
    }

    context.raid.boss.currentHp = Math.max(0, context.raid.boss.currentHp - damage);
    context.raid.boss.totalDamage += damage;
    context.raid.boss.totalAttacks += 1;
    context.raid.boss.damageByUserId.set(
      userId,
      (context.raid.boss.damageByUserId.get(userId) ?? 0) + damage,
    );
    context.raid.rewardEligibleUserIds.add(userId);
    const hitAchievements = awardManualDiceAchievements(
      progression,
      userId,
      getDiceRaidAchievementIds(recordRaidHit(db, { userId, damage })),
    );

    const boss = context.raid.boss;
    if (boss.currentHp <= 0) {
      const killShotAchievements = awardManualDiceAchievements(progression, userId, [
        "raid-kill-shot",
      ]);
      const rewardSummary = describeRaidReward(boss.reward);
      const eligibleParticipantCount = context.raid.rewardEligibleUserIds.size;
      resolveRaid(context, "success", nowMs);
      return {
        kind: "applied",
        defeated: true,
        summary: appendAchievementUnlockText(
          appendAchievementUnlockText(
            `Raid damage: ${damage} to ${boss.name}. Boss defeated. ${eligibleParticipantCount} eligible raider${eligibleParticipantCount === 1 ? "" : "s"} earned ${rewardSummary}.`,
            hitAchievements,
          ),
          killShotAchievements,
        ),
      };
    }

    scheduleActiveRender(context, "[raids] Failed to refresh active raid progress prompt.");
    return {
      kind: "applied",
      defeated: false,
      summary: appendAchievementUnlockText(
        `Raid damage: ${damage} to ${boss.name}. ${boss.currentHp}/${boss.maxHp} HP remaining.`,
        hitAchievements,
      ),
    };
  };

  const getLiveRaidsSnapshot = (): RaidAdminLiveRaidSnapshot[] => {
    return Array.from(liveRaidsById.values())
      .map(buildLiveRaidSnapshot)
      .sort((left, right) => left.scheduledStartAt.getTime() - right.scheduledStartAt.getTime());
  };

  const hasBlockingRaid = (): boolean => {
    return Array.from(liveRaidsById.values()).some((context) =>
      isBlockingRaidStatus(context.raid.status),
    );
  };

  const stop = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    await triggerChain.catch(() => {});

    const liveRaids = Array.from(liveRaidsById.values());
    for (const context of liveRaids) {
      clearRaidTimers(context);
    }

    await Promise.allSettled(
      liveRaids.map((context) =>
        queueTransition(context, async () => {
          await runInterruptTransition(context);
        }),
      ),
    );
  };

  return {
    triggerRaidNow,
    handleButtonInteraction,
    applyDiceRoll,
    getLiveRaidsSnapshot,
    hasBlockingRaid,
    stop,
  };
};
