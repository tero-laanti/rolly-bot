import { randomUUID } from "node:crypto";
import type { BaseMessageOptions, ButtonInteraction, Client } from "discord.js";
import type { RaidsConfig } from "../../../shared/config";
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
import type { RaidAdminActiveRaidSnapshot } from "../application/ports";
import type { ActiveRaidContext, RaidsLiveRuntimeLogger } from "./live-runtime-types";
import {
  registerActiveRaid,
  resolveActiveRaid,
  type RaidsState,
  updateActiveRaid,
} from "./state-store";

type CreateRaidsLiveRuntimeInput = {
  client: Client;
  config: RaidsConfig;
  state: RaidsState;
  logger?: RaidsLiveRuntimeLogger;
};

type QueueAnnouncementEditInput = {
  raidId: string;
  logFailureMessage: string;
  allowAfterJoinWindowClosed?: boolean;
  createMessage: (context: ActiveRaidContext) => BaseMessageOptions;
};

export type TriggerRaidNowResult =
  | {
      created: true;
      raidId: string;
      scheduledStartAt: Date;
    }
  | {
      created: false;
    };

export type RaidsLiveRuntime = {
  triggerRaidNow: () => Promise<TriggerRaidNowResult>;
  handleButtonInteraction: (interaction: ButtonInteraction) => Promise<void>;
  getActiveRaidsSnapshot: () => RaidAdminActiveRaidSnapshot[];
  stop: () => Promise<void>;
};

const raidTitle = "Dice raid";

export const createRaidsLiveRuntime = ({
  client,
  config,
  state,
  logger = console,
}: CreateRaidsLiveRuntimeInput): RaidsLiveRuntime => {
  const activeRaidsById = new Map<string, ActiveRaidContext>();

  const syncRaidState = (context: ActiveRaidContext): void => {
    updateActiveRaid(state, context.raidId, {
      title: context.title,
      status: context.status,
      scheduledStartAtMs: context.scheduledStartAtMs,
      expiresAtMs: context.expiresAtMs,
      participantIds: Array.from(context.participantIds),
      channelId: context.announcementMessage.channelId,
      announcementMessageId: context.announcementMessage.id,
      activeMessageId: context.activeMessage?.id ?? null,
    });
  };

  const clearRaidTimers = (context: ActiveRaidContext | undefined): void => {
    if (!context) {
      return;
    }

    if (context.startTimer) {
      clearTimeout(context.startTimer);
      context.startTimer = null;
    }
    if (context.resolveTimer) {
      clearTimeout(context.resolveTimer);
      context.resolveTimer = null;
    }
  };

  const forgetRaid = (raidId: string): void => {
    clearRaidTimers(activeRaidsById.get(raidId));
    activeRaidsById.delete(raidId);
    resolveActiveRaid(state, raidId);
  };

  const queueAnnouncementEdit = async ({
    raidId,
    logFailureMessage,
    allowAfterJoinWindowClosed = false,
    createMessage,
  }: QueueAnnouncementEditInput): Promise<boolean> => {
    const context = activeRaidsById.get(raidId);
    if (!context) {
      return false;
    }

    let updated = false;

    context.announcementEditChain = context.announcementEditChain
      .catch(() => {
        // Keep the chain usable even if a prior edit failed.
      })
      .then(async () => {
        const latestContext = activeRaidsById.get(raidId);
        if (!latestContext) {
          return;
        }

        if (!allowAfterJoinWindowClosed && latestContext.joinWindowClosed) {
          return;
        }

        updated = await latestContext.announcementMessage
          .edit(createMessage(latestContext))
          .then(() => true)
          .catch((error) => {
            logger.warn(logFailureMessage, error);
            return false;
          });
      });

    await context.announcementEditChain;
    return updated;
  };

  const refreshAnnouncementPrompt = async (raidId: string, disabled = false): Promise<boolean> => {
    return queueAnnouncementEdit({
      raidId,
      logFailureMessage: "[raids] Failed to refresh announcement prompt.",
      allowAfterJoinWindowClosed: disabled,
      createMessage: (context) =>
        buildRaidAnnouncementPrompt({
          raidId,
          participantIds: Array.from(context.participantIds),
          scheduledStartAtMs: context.scheduledStartAtMs,
          disabled,
        }),
    });
  };

  const renderCancelledAnnouncement = async (raidId: string): Promise<boolean> => {
    return queueAnnouncementEdit({
      raidId,
      logFailureMessage: "[raids] Failed to update cancelled raid prompt.",
      allowAfterJoinWindowClosed: true,
      createMessage: (context) =>
        buildRaidCancelledPrompt({
          scheduledStartAtMs: context.scheduledStartAtMs,
        }),
    });
  };

  const renderStartFailedAnnouncement = async (raidId: string): Promise<boolean> => {
    return queueAnnouncementEdit({
      raidId,
      logFailureMessage: "[raids] Failed to update failed-start raid prompt.",
      allowAfterJoinWindowClosed: true,
      createMessage: (context) =>
        buildRaidStartFailedPrompt({
          participantIds: Array.from(context.participantIds),
        }),
    });
  };

  const renderResolveFailedAnnouncement = async (raidId: string): Promise<boolean> => {
    return queueAnnouncementEdit({
      raidId,
      logFailureMessage: "[raids] Failed to update failed-resolution raid prompt.",
      allowAfterJoinWindowClosed: true,
      createMessage: (context) =>
        buildRaidResolveFailedPrompt({
          participantIds: Array.from(context.participantIds),
          resolvedAtMs: Date.now(),
        }),
    });
  };

  const closeRaidDuringShutdown = async (context: ActiveRaidContext): Promise<void> => {
    context.joinWindowClosed = true;

    await refreshAnnouncementPrompt(context.raidId, true);

    const interruptedPrompt = buildRaidInterruptedPrompt({
      participantIds: Array.from(context.participantIds),
    });

    const targetMessage = context.activeMessage ?? context.announcementMessage;
    const closed = await targetMessage
      .edit(interruptedPrompt)
      .then(() => true)
      .catch((error) => {
        logger.warn("[raids] Failed to close raid during shutdown.", error);
        return false;
      });

    if (!closed && context.activeMessage) {
      await queueAnnouncementEdit({
        raidId: context.raidId,
        logFailureMessage: "[raids] Failed to update interrupted raid announcement.",
        allowAfterJoinWindowClosed: true,
        createMessage: () => interruptedPrompt,
      });
    }

    forgetRaid(context.raidId);
  };

  const resolveRaidLifecycle = async (raidId: string): Promise<void> => {
    const context = activeRaidsById.get(raidId);
    if (!context) {
      return;
    }

    clearRaidTimers(context);

    if (context.activeMessage) {
      const resolvedPrompt = buildRaidResolvedPrompt({
        participantIds: Array.from(context.participantIds),
        resolvedAtMs: Date.now(),
      });

      const resolved = await context.activeMessage
        .edit(resolvedPrompt)
        .then(() => true)
        .catch((error) => {
          logger.warn("[raids] Failed to update resolved raid prompt.", error);
          return false;
        });

      if (!resolved) {
        await renderResolveFailedAnnouncement(raidId);
      }
    }

    forgetRaid(raidId);
  };

  const startRaid = async (raidId: string): Promise<void> => {
    const context = activeRaidsById.get(raidId);
    if (!context) {
      return;
    }

    context.startTimer = null;
    context.joinWindowClosed = true;
    context.status = "active";
    context.expiresAtMs = Date.now() + config.activeDurationMs;
    syncRaidState(context);

    await refreshAnnouncementPrompt(raidId, true);

    if (context.participantIds.size < 1) {
      await renderCancelledAnnouncement(raidId);
      forgetRaid(raidId);
      return;
    }

    const activeChannel = context.announcementMessage.channel;
    if (!("send" in activeChannel) || typeof activeChannel.send !== "function") {
      logger.error("[raids] Active raid channel is not writable.");
      await renderStartFailedAnnouncement(raidId);
      forgetRaid(raidId);
      return;
    }

    const activeMessage = await activeChannel
      .send(
        buildRaidStartedPrompt({
          participantIds: Array.from(context.participantIds),
          startedAtMs: Date.now(),
          endsAtMs: context.expiresAtMs,
        }),
      )
      .catch((error: unknown) => {
        logger.error("[raids] Failed to send active raid prompt.", error);
        return null;
      });

    if (!activeMessage) {
      await renderStartFailedAnnouncement(raidId);
      forgetRaid(raidId);
      return;
    }

    context.activeMessage = activeMessage;
    syncRaidState(context);

    context.resolveTimer = setTimeout(() => {
      void resolveRaidLifecycle(raidId).catch((error) => {
        logger.warn("[raids] Failed to resolve raid lifecycle.", error);
      });
    }, config.activeDurationMs);
  };

  const triggerRaidNow = async (): Promise<TriggerRaidNowResult> => {
    if (!config.channelId) {
      logger.warn("[raids] RAIDS_CHANNEL_ID not set. Skipping trigger.");
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

    const context: ActiveRaidContext = {
      raidId,
      title: raidTitle,
      status: "joining",
      announcementMessage,
      activeMessage: null,
      scheduledStartAtMs,
      expiresAtMs: scheduledStartAtMs,
      participantIds: new Set<string>(),
      startTimer: null,
      resolveTimer: null,
      announcementEditChain: Promise.resolve(),
      joinWindowClosed: false,
    };

    context.startTimer = setTimeout(() => {
      void startRaid(raidId).catch((error) => {
        logger.warn("[raids] Failed to transition raid into active state.", error);
      });
    }, config.joinLeadMs);

    activeRaidsById.set(raidId, context);
    registerActiveRaid(state, {
      id: raidId,
      title: context.title,
      status: context.status,
      createdAtMs: Date.now(),
      scheduledStartAtMs,
      expiresAtMs: context.expiresAtMs,
      participantIds: [],
      channelId: announcementMessage.channelId,
      announcementMessageId: announcementMessage.id,
      activeMessageId: null,
    });

    return {
      created: true,
      raidId,
      scheduledStartAt: new Date(scheduledStartAtMs),
    };
  };

  const handleButtonInteraction = async (interaction: ButtonInteraction): Promise<void> => {
    const raidId = parseRaidJoinButtonId(interaction.customId);
    if (!raidId) {
      await interaction.deferUpdate();
      return;
    }

    const context = activeRaidsById.get(raidId);
    if (
      !context ||
      context.status !== "joining" ||
      context.joinWindowClosed ||
      Date.now() >= context.scheduledStartAtMs
    ) {
      await interaction.reply({
        content: "Too late — this raid is already closed.",
        ephemeral: true,
      });
      return;
    }

    if (context.participantIds.has(interaction.user.id)) {
      await interaction.reply({
        content: "You're already signed up for this raid.",
        ephemeral: true,
      });
      return;
    }

    context.participantIds.add(interaction.user.id);
    syncRaidState(context);

    await interaction.deferUpdate();
    await refreshAnnouncementPrompt(raidId);
  };

  const getActiveRaidsSnapshot = (): RaidAdminActiveRaidSnapshot[] => {
    return Array.from(activeRaidsById.values())
      .map((context) => ({
        raidId: context.raidId,
        title: context.title,
        status: context.status,
        participantCount: context.participantIds.size,
        scheduledStartAt: new Date(context.scheduledStartAtMs),
        expiresAt: context.expiresAtMs ? new Date(context.expiresAtMs) : null,
        channelId: context.announcementMessage.channelId,
        announcementMessageId: context.announcementMessage.id,
        activeMessageId: context.activeMessage?.id ?? null,
      }))
      .sort((left, right) => left.scheduledStartAt.getTime() - right.scheduledStartAt.getTime());
  };

  const stop = async (): Promise<void> => {
    const activeRaids = Array.from(activeRaidsById.values());
    for (const context of activeRaids) {
      await closeRaidDuringShutdown(context);
    }
  };

  return {
    triggerRaidNow,
    handleButtonInteraction,
    getActiveRaidsSnapshot,
    stop,
  };
};
