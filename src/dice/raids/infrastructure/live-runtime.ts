import { randomUUID } from "node:crypto";
import type { BaseMessageOptions, ButtonInteraction, Client, Message } from "discord.js";
import type { RaidsConfig } from "../../../shared/config";
import type {
  RaidAdminLiveRaidSnapshot,
  RaidStatus,
  TriggerRaidNowOutcome,
} from "../application/ports";
import { parseRaidJoinButtonId } from "../interfaces/discord/button-ids";
import {
  buildRaidAnnouncementPrompt,
  buildRaidCancelledPrompt,
  buildRaidInterruptedPrompt,
  buildRaidResolveFailedPrompt,
  buildRaidResolvedPrompt,
  buildRaidStartFailedPrompt,
  buildRaidStartedPrompt,
} from "../interfaces/discord/prompt";
import type { ActiveRaidContext, RaidsLiveRuntimeLogger } from "./live-runtime-types";

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
  getLiveRaidsSnapshot: () => RaidAdminLiveRaidSnapshot[];
  hasBlockingRaid: () => boolean;
  stop: () => Promise<void>;
};

const raidTitle = "Dice raid";

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

export const createRaidsLiveRuntime = ({
  client,
  config,
  logger = console,
}: CreateRaidsLiveRuntimeInput): RaidsLiveRuntime => {
  const liveRaidsById = new Map<string, ActiveRaidContext>();
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
  };

  const finalizeRaid = (context: ActiveRaidContext): void => {
    clearRaidTimers(context);
    if (!isCurrentContext(context)) {
      return;
    }

    liveRaidsById.delete(context.raid.raidId);
  };

  const buildLiveRaidSnapshot = (context: ActiveRaidContext): RaidAdminLiveRaidSnapshot => {
    return {
      raidId: context.raid.raidId,
      title: context.raid.title,
      status: context.raid.status,
      participantCount: context.raid.participantIds.size,
      scheduledStartAt: new Date(context.raid.scheduledStartAtMs),
      expiresAt: context.raid.expiresAtMs === null ? null : new Date(context.raid.expiresAtMs),
      channelId: context.handles.announcementMessage.channelId,
      announcementMessageId: context.handles.announcementMessage.id,
      activeMessageId: context.handles.activeMessage?.id ?? null,
    };
  };

  const buildAnnouncementPromptForCurrentState = (
    context: ActiveRaidContext,
  ): BaseMessageOptions => {
    const participantIds = participantIdsFromContext(context);

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
        });
      case "cancelled":
        return buildRaidCancelledPrompt({
          scheduledStartAtMs: context.raid.scheduledStartAtMs,
        });
      case "interrupted":
        return buildRaidInterruptedPrompt({
          participantIds,
        });
      case "start-failed":
        return buildRaidStartFailedPrompt({
          participantIds,
        });
      case "resolved":
        return buildRaidResolvedPrompt({
          participantIds,
          resolvedAtMs: context.raid.closedAtMs ?? Date.now(),
        });
      case "cleanup-needed":
        return buildRaidResolveFailedPrompt({
          participantIds,
          resolvedAtMs: context.raid.closedAtMs ?? Date.now(),
        });
    }
  };

  const buildActivePromptForCurrentState = (context: ActiveRaidContext): BaseMessageOptions => {
    const participantIds = participantIdsFromContext(context);

    switch (context.raid.status) {
      case "active":
        return buildRaidStartedPrompt({
          participantIds,
          startedAtMs: context.raid.startedAtMs ?? Date.now(),
          endsAtMs: context.raid.expiresAtMs ?? Date.now(),
        });
      case "resolved":
        return buildRaidResolvedPrompt({
          participantIds,
          resolvedAtMs: context.raid.closedAtMs ?? Date.now(),
        });
      case "interrupted":
        return buildRaidInterruptedPrompt({
          participantIds,
        });
      default:
        return buildRaidInterruptedPrompt({
          participantIds,
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
      .catch(() => {
        // Keep later edits usable even if an earlier edit failed.
      })
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

  const renderActiveMessageForCurrentState = async ({
    context,
    logFailureMessage,
  }: {
    context: ActiveRaidContext;
    logFailureMessage: string;
  }): Promise<boolean> => {
    if (!context.handles.activeMessage) {
      return false;
    }

    return editMessage({
      message: context.handles.activeMessage,
      prompt: buildActivePromptForCurrentState(context),
      logFailureMessage,
    });
  };

  const queueTransition = async (
    context: ActiveRaidContext,
    transition: () => Promise<void>,
  ): Promise<void> => {
    context.handles.transitionChain = context.handles.transitionChain
      .catch(() => {
        // Keep later transitions usable even if an earlier one failed.
      })
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
        await runResolveTransition(context);
      }).catch((error) => {
        logger.warn("[raids] Failed to resolve raid lifecycle.", error);
      });
    }, delayMs);
  };

  const transitionToStarting = (context: ActiveRaidContext): void => {
    context.raid.status = "starting";
    context.raid.startedAtMs = null;
    context.raid.expiresAtMs = null;
    context.raid.closedAtMs = null;
  };

  const transitionToActive = (
    context: ActiveRaidContext,
    {
      startedAtMs,
      expiresAtMs,
    }: {
      startedAtMs: number;
      expiresAtMs: number;
    },
  ): void => {
    context.raid.status = "active";
    context.raid.startedAtMs = startedAtMs;
    context.raid.expiresAtMs = expiresAtMs;
    context.raid.closedAtMs = null;
  };

  const transitionToTerminal = (
    context: ActiveRaidContext,
    status: Extract<
      RaidStatus,
      "cancelled" | "interrupted" | "start-failed" | "resolved" | "cleanup-needed"
    >,
    closedAtMs = Date.now(),
  ): void => {
    context.raid.status = status;
    context.raid.expiresAtMs = null;
    context.raid.closedAtMs = closedAtMs;
  };

  const closeUntrackedRaidMessage = async ({
    message,
    participantIds,
    logFailureMessage,
  }: {
    message: Message;
    participantIds: readonly string[];
    logFailureMessage: string;
  }): Promise<void> => {
    await editMessage({
      message,
      prompt: buildRaidInterruptedPrompt({
        participantIds,
      }),
      logFailureMessage,
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

    const startedAtMs = Date.now();
    const expiresAtMs = startedAtMs + config.activeDurationMs;
    const activeMessage = await activeChannel
      .send(
        buildRaidStartedPrompt({
          participantIds: participantIdsFromContext(context),
          startedAtMs,
          endsAtMs: expiresAtMs,
        }),
      )
      .catch((error: unknown) => {
        logger.error("[raids] Failed to send active raid prompt.", error);
        return null;
      });

    if (!activeMessage) {
      if (!isCurrentContext(context) || currentRaidStatus(context) !== "starting") {
        return;
      }

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
        participantIds: participantIdsFromContext(context),
        logFailureMessage: "[raids] Failed to close stale active raid message.",
      });
      return;
    }

    context.handles.activeMessage = activeMessage;
    transitionToActive(context, {
      startedAtMs,
      expiresAtMs,
    });
    scheduleResolve(context);
  };

  const runResolveTransition = async (context: ActiveRaidContext): Promise<void> => {
    if (!isCurrentContext(context) || context.raid.status !== "active") {
      return;
    }

    clearRaidTimers(context);

    const closedAtMs = Date.now();
    transitionToTerminal(context, "resolved", closedAtMs);

    if (!context.handles.activeMessage) {
      transitionToTerminal(context, "cleanup-needed", closedAtMs);
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cleanup-needed"],
        logFailureMessage: "[raids] Failed to update failed-resolution raid announcement.",
      });
      finalizeRaid(context);
      return;
    }

    const resolved = await renderActiveMessageForCurrentState({
      context,
      logFailureMessage: "[raids] Failed to update resolved raid prompt.",
    });

    if (!resolved && isCurrentContext(context) && currentRaidStatus(context) === "resolved") {
      transitionToTerminal(context, "cleanup-needed", closedAtMs);
      await queueAnnouncementRender({
        context,
        allowedStatuses: ["cleanup-needed"],
        logFailureMessage: "[raids] Failed to update failed-resolution raid announcement.",
      });
    }

    finalizeRaid(context);
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
        scheduledStartAtMs,
        startedAtMs: null,
        expiresAtMs: null,
        closedAtMs: null,
        participantIds: new Set<string>(),
      },
      handles: {
        announcementMessage,
        activeMessage: null,
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
        content: "Too late — this raid is already closed.",
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
    await interaction.deferUpdate();
    await queueAnnouncementRender({
      context,
      allowedStatuses: ["joining"],
      logFailureMessage: "[raids] Failed to refresh raid announcement prompt.",
    });
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
    getLiveRaidsSnapshot,
    hasBlockingRaid,
    stop,
  };
};
