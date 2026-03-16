import type { ButtonInteraction, Client } from "discord.js";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { getDatabase } from "../../../shared/db";
import { createSqliteDiceHostileEffectsService } from "../../progression/infrastructure/sqlite/hostile-effects-service";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";
import { createRandomEventContentState } from "../domain/content";
import type { RandomEventClaimPolicy } from "../domain/claim-policy";
import type { RandomEventRarityTier } from "../domain/variety";
import {
  buildRandomEventClaimButtonId,
  buildRandomEventClaimPrompt,
  createRandomEventInteractionWindowManager,
  parseRandomEventClaimButtonId,
} from "../interfaces/discord/interaction-window";
import type { TriggerOpportunityResult } from "./foundation-scheduler";
import {
  buildActiveClaimDescription,
  buildClaimActivityLine,
  getRandomEventEmbedTitle,
  getRandomEventRarityPresentation,
} from "./live-runtime-presentation";
import { resolveRandomEvent } from "./live-runtime-resolution";
import { triggerRandomEventOpportunity } from "./live-runtime-trigger";
import type {
  ActiveRandomEventContext,
  RandomEventsLiveRuntimeLogger,
} from "./live-runtime-types";
import type { RandomEventsState } from "./state-store";

type CreateRandomEventsLiveRuntimeInput = {
  client: Client;
  config: RandomEventsFoundationConfig;
  state: RandomEventsState;
  logger?: RandomEventsLiveRuntimeLogger;
};

export type RandomEventsLiveActiveEventSnapshot = {
  eventId: string;
  title: string;
  rarity: RandomEventRarityTier;
  claimPolicy: RandomEventClaimPolicy;
  participantCount: number;
  expiresAt: Date | null;
  channelId: string;
  messageId: string;
};

export type RandomEventsLiveRuntime = {
  onTriggerOpportunity: (context: {
    now: Date;
    requiredClaimPolicy?: RandomEventClaimPolicy;
  }) => Promise<TriggerOpportunityResult>;
  handleButtonInteraction: (interaction: ButtonInteraction) => Promise<void>;
  getActiveEventsSnapshot: () => RandomEventsLiveActiveEventSnapshot[];
  stop: () => void;
};

export const createRandomEventsLiveRuntime = ({
  client,
  config,
  state,
  logger = console,
}: CreateRandomEventsLiveRuntimeInput): RandomEventsLiveRuntime => {
  const contentState = createRandomEventContentState();
  const activeEventsById = new Map<string, ActiveRandomEventContext>();
  const db = getDatabase();
  const progression = createSqliteProgressionRepository(db);
  const hostileEffects = createSqliteDiceHostileEffectsService(db);

  const windowManager = createRandomEventInteractionWindowManager({
    logger,
  });

  const refreshActiveEventPrompt = async (
    eventId: string,
    activity: { userId: string; mode: "did" | "already-ready" } | null,
  ): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    const activityLine = activity
      ? buildClaimActivityLine(
          context.selection.scenario,
          activity.userId,
          context.selection.renderedClaimLabel,
          activity.mode,
        )
      : null;
    const windowSnapshot = windowManager.getWindow(eventId);
    const rarityPresentation = getRandomEventRarityPresentation(context.selection.scenario.rarity);

    const prompt = buildRandomEventClaimPrompt({
      title: getRandomEventEmbedTitle(context.selection.scenario, context.selection.renderedTitle),
      description: buildActiveClaimDescription(
        context.selection.renderedPrompt,
        activityLine,
        windowSnapshot?.expiresAtMs ?? null,
        windowSnapshot?.participants ?? [],
      ),
      buttonCustomId: buildRandomEventClaimButtonId(eventId),
      buttonLabel: context.selection.renderedClaimLabel,
      color: rarityPresentation.color,
      footerText: rarityPresentation.label,
    });

    await context.message.edit(prompt).catch((error) => {
      logger.warn("[random-events] Failed to refresh active event prompt.", error);
    });
  };

  const onTriggerOpportunity = async (context: {
    now: Date;
    requiredClaimPolicy?: RandomEventClaimPolicy;
  }): Promise<TriggerOpportunityResult> => {
    return triggerRandomEventOpportunity({
      client,
      config,
      logger,
      contentState,
      activeEventsById,
      windowManager,
      requiredClaimPolicy: context.requiredClaimPolicy,
      onResolved: async (eventId, participants) => {
        await resolveRandomEvent({
          activeEventsById,
          state,
          progression,
          hostileEffects,
          eventId,
          participants,
        });
      },
    });
  };

  const handleButtonInteraction = async (interaction: ButtonInteraction): Promise<void> => {
    const eventId = parseRandomEventClaimButtonId(interaction.customId);
    if (!eventId) {
      await interaction.deferUpdate();
      return;
    }

    const result = windowManager.claim(eventId, interaction.user.id);
    if (result.status === "accepted") {
      await interaction.deferUpdate();

      if (!result.becameResolved) {
        await refreshActiveEventPrompt(eventId, {
          userId: interaction.user.id,
          mode: "did",
        });
      }
      return;
    }

    if (result.status === "already-joined") {
      await interaction.reply({
        content: "You're already ready for this one.",
        ephemeral: true,
      });
      return;
    }

    if (result.status === "already-claimed") {
      await interaction.reply({
        content: "Too late — someone else got there first.",
        ephemeral: true,
      });
      return;
    }

    if (result.status === "closed") {
      await interaction.reply({
        content: "Too late — this event is already closed.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();
  };

  const getActiveEventsSnapshot = (): RandomEventsLiveActiveEventSnapshot[] => {
    return Array.from(activeEventsById.values())
      .map((context) => {
        const windowSnapshot = windowManager.getWindow(context.eventId);
        return {
          eventId: context.eventId,
          title: context.selection.renderedTitle,
          rarity: context.selection.scenario.rarity,
          claimPolicy: context.selection.scenario.claimPolicy,
          participantCount: windowSnapshot?.participants.length ?? 0,
          expiresAt: windowSnapshot ? new Date(windowSnapshot.expiresAtMs) : null,
          channelId: context.message.channelId,
          messageId: context.message.id,
        };
      })
      .sort((left, right) => {
        const leftExpiresAt = left.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightExpiresAt = right.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftExpiresAt - rightExpiresAt;
      });
  };

  const stop = (): void => {
    windowManager.stop();
    activeEventsById.clear();
  };

  return {
    onTriggerOpportunity,
    handleButtonInteraction,
    getActiveEventsSnapshot,
    stop,
  };
};
