import { randomUUID } from "node:crypto";
import type { ButtonInteraction, Client } from "discord.js";
import type { RaidsConfig } from "../../../shared/config";
import { parseRaidJoinButtonId } from "../interfaces/discord/button-ids";
import {
  buildRaidAnnouncementPrompt,
  buildRaidCancelledPrompt,
  buildRaidResolvedPrompt,
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
  stop: () => void;
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

  const refreshAnnouncementPrompt = async (raidId: string, disabled = false): Promise<void> => {
    const context = activeRaidsById.get(raidId);
    if (!context) {
      return;
    }

    await context.announcementMessage
      .edit(
        buildRaidAnnouncementPrompt({
          raidId,
          participantIds: Array.from(context.participantIds),
          scheduledStartAtMs: context.scheduledStartAtMs,
          disabled,
        }),
      )
      .catch((error) => {
        logger.warn("[raids] Failed to refresh announcement prompt.", error);
      });
  };

  const resolveRaidLifecycle = async (raidId: string): Promise<void> => {
    const context = activeRaidsById.get(raidId);
    if (!context) {
      return;
    }

    clearRaidTimers(context);

    if (context.activeMessage) {
      await context.activeMessage
        .edit(
          buildRaidResolvedPrompt({
            participantIds: Array.from(context.participantIds),
            resolvedAtMs: Date.now(),
          }),
        )
        .catch((error) => {
          logger.warn("[raids] Failed to update resolved raid prompt.", error);
        });
    }

    activeRaidsById.delete(raidId);
    resolveActiveRaid(state, raidId);
  };

  const startRaid = async (raidId: string): Promise<void> => {
    const context = activeRaidsById.get(raidId);
    if (!context) {
      return;
    }

    context.startTimer = null;

    await refreshAnnouncementPrompt(raidId, true);

    if (context.participantIds.size < 1) {
      await context.announcementMessage
        .edit(buildRaidCancelledPrompt({ scheduledStartAtMs: context.scheduledStartAtMs }))
        .catch((error) => {
          logger.warn("[raids] Failed to update cancelled raid prompt.", error);
        });
      activeRaidsById.delete(raidId);
      resolveActiveRaid(state, raidId);
      return;
    }

    context.status = "active";
    context.expiresAtMs = Date.now() + config.activeDurationMs;

    const activeChannel = context.announcementMessage.channel;
    if (!("send" in activeChannel) || typeof activeChannel.send !== "function") {
      logger.error("[raids] Active raid channel is not writable.");
      activeRaidsById.delete(raidId);
      resolveActiveRaid(state, raidId);
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
      activeRaidsById.delete(raidId);
      resolveActiveRaid(state, raidId);
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
    if (!context || context.status !== "joining" || Date.now() >= context.scheduledStartAtMs) {
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

  const stop = (): void => {
    for (const context of activeRaidsById.values()) {
      clearRaidTimers(context);
    }
    activeRaidsById.clear();
  };

  return {
    triggerRaidNow,
    handleButtonInteraction,
    getActiveRaidsSnapshot,
    stop,
  };
};
