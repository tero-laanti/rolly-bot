import { randomUUID } from "node:crypto";
import type { Client } from "discord.js";
import { getRandomEventBalanceData } from "../../../rolly-data/load";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { secondMs } from "../../../shared/time";
import type { RandomEventClaimPolicy } from "../domain/claim-policy";
import { selectRandomEventScenario } from "../domain/content";
import type { RandomEventVarietyState } from "../domain/variety";
import {
  buildRandomEventClaimButtonId,
  buildRandomEventClaimPrompt,
  type RandomEventInteractionWindowLifecycleContext,
  type RandomEventInteractionWindowManager,
} from "../interfaces/discord/interaction-window";
import { randomEventContentPackV1 } from "./content-pack";
import type { TriggerOpportunityResult } from "./foundation-scheduler";
import {
  buildActiveClaimDescription,
  getRandomEventEmbedTitle,
  getRandomEventRarityPresentation,
} from "./live-runtime-presentation";
import type { ActiveRandomEventContext, RandomEventsLiveRuntimeLogger } from "./live-runtime-types";

const cloneVarietyState = (state: RandomEventVarietyState): RandomEventVarietyState => {
  return {
    triggerCount: state.triggerCount,
    nonRareStreak: state.nonRareStreak,
    lastSeenTriggerByTemplateId: new Map(state.lastSeenTriggerByTemplateId),
  };
};

const copyVarietyState = (
  target: RandomEventVarietyState,
  source: RandomEventVarietyState,
): void => {
  target.triggerCount = source.triggerCount;
  target.nonRareStreak = source.nonRareStreak;
  target.lastSeenTriggerByTemplateId = new Map(source.lastSeenTriggerByTemplateId);
};

export const triggerRandomEventOpportunity = async ({
  client,
  config,
  logger,
  contentState,
  activeEventsById,
  windowManager,
  requiredClaimPolicy,
  onResolved,
}: {
  client: Client;
  config: RandomEventsFoundationConfig;
  logger: RandomEventsLiveRuntimeLogger;
  contentState: RandomEventVarietyState;
  activeEventsById: Map<string, ActiveRandomEventContext>;
  windowManager: RandomEventInteractionWindowManager;
  requiredClaimPolicy?: RandomEventClaimPolicy;
  onResolved: (
    eventId: string,
    context: RandomEventInteractionWindowLifecycleContext,
  ) => Promise<void>;
}): Promise<TriggerOpportunityResult> => {
  if (!config.channelId) {
    logger.warn("[random-events] RANDOM_EVENTS_CHANNEL_ID not set. Skipping trigger.");
    return { created: false };
  }

  const channel = await client.channels.fetch(config.channelId).catch((error) => {
    logger.error("[random-events] Failed to fetch configured event channel.", error);
    return null;
  });

  if (
    !channel ||
    !channel.isTextBased() ||
    !("send" in channel) ||
    typeof channel.send !== "function"
  ) {
    logger.warn("[random-events] Configured event channel is not writable text channel.");
    return { created: false };
  }

  const randomEventBalance = getRandomEventBalanceData();
  const candidateVarietyState = cloneVarietyState(contentState);
  const candidateScenarios =
    requiredClaimPolicy === undefined
      ? randomEventContentPackV1
      : randomEventContentPackV1.filter((scenario) => scenario.claimPolicy === requiredClaimPolicy);
  const selection = selectRandomEventScenario(candidateScenarios, candidateVarietyState, {
    antiRepeatCooldownTriggers: randomEventBalance.variety.antiRepeatCooldownTriggers,
    rarityChances: randomEventBalance.variety.rarityChances,
    pity: randomEventBalance.variety.pity,
  });

  if (!selection) {
    return { created: false };
  }

  const eventId = `random-event:${randomUUID()}`;
  const claimWindowDurationMs =
    selection.scenario.claimWindowSeconds *
    secondMs *
    randomEventBalance.claimWindowDurationMultiplier;
  const estimatedExpiresAtMs = Date.now() + claimWindowDurationMs;
  const rarityPresentation = getRandomEventRarityPresentation(selection.scenario.rarity);
  const prompt = buildRandomEventClaimPrompt({
    title: getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle),
    description: buildActiveClaimDescription(selection.renderedPrompt, null, estimatedExpiresAtMs),
    buttonCustomId: buildRandomEventClaimButtonId(eventId),
    buttonLabel: selection.renderedClaimLabel,
    color: rarityPresentation.color,
    footerText: rarityPresentation.label,
  });

  const message = await channel.send(prompt).catch((error) => {
    logger.error("[random-events] Failed to send event message.", error);
    return null;
  });

  if (!message) {
    return { created: false };
  }

  copyVarietyState(contentState, candidateVarietyState);
  activeEventsById.set(eventId, {
    eventId,
    selection,
    message,
    sequenceChallenge: null,
    claimWindowExpiresAtMs: estimatedExpiresAtMs,
    attemptedUserIds: new Set(),
    failedAttemptLines: [],
  });

  windowManager.openWindow({
    windowId: eventId,
    durationMs: claimWindowDurationMs,
    policy: selection.scenario.claimPolicy,
    callbacks: {
      onResolved: async (context) => {
        await onResolved(eventId, context);
      },
    },
  });

  const openedWindow = windowManager.getWindow(eventId);

  return {
    created: true,
    eventId,
    expiresAt: openedWindow ? new Date(openedWindow.expiresAtMs) : new Date(estimatedExpiresAtMs),
  };
};
