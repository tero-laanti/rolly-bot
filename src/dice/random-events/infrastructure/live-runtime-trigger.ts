import { randomUUID } from "node:crypto";
import type { Client } from "discord.js";
import { getRandomEventBalanceData } from "../../../rolly-data/load";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { secondMs } from "../../../shared/time";
import type { RandomEventClaimPolicy } from "../domain/claim-policy";
import {
  getRandomEventFlow,
  selectRandomEventScenario,
  type RandomEventSelectionResult,
} from "../domain/content";
import type { RandomEventVarietyState } from "../domain/variety";
import {
  buildRandomEventActionButtonId,
  buildRandomEventClaimButtonId,
  buildRandomEventClaimPrompt,
  type RandomEventPromptButton,
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

export const buildInitialRandomEventPromptButtons = ({
  eventId,
  selection,
}: {
  eventId: string;
  selection: RandomEventSelectionResult;
}): RandomEventPromptButton[] | undefined => {
  const flow = getRandomEventFlow(selection.scenario);
  if (flow.type === "group-meter") {
    return [
      {
        customId: buildRandomEventActionButtonId(eventId, "join"),
        label: selection.renderedClaimLabel,
      },
    ];
  }

  return undefined;
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
  if (randomEventBalance.claimWindowDurationMultiplier <= 0) {
    logger.error(
      "[random-events] randomEventBalance.claimWindowDurationMultiplier must be greater than 0.",
    );
    return { created: false };
  }

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
  if (!Number.isFinite(claimWindowDurationMs) || claimWindowDurationMs < 1) {
    logger.error("[random-events] Computed claim window duration must be at least 1ms.");
    return { created: false };
  }

  const estimatedExpiresAtMs = Date.now() + claimWindowDurationMs;
  const rarityPresentation = getRandomEventRarityPresentation(selection.scenario.rarity);
  const flow = getRandomEventFlow(selection.scenario);
  const prompt = buildRandomEventClaimPrompt({
    title: getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle),
    description: buildActiveClaimDescription(
      selection.renderedPrompt,
      null,
      estimatedExpiresAtMs,
      [],
      [],
      selection.scenario.requiredReadyCount ?? null,
    ),
    buttonCustomId: buildRandomEventClaimButtonId(eventId),
    buttonLabel: selection.renderedClaimLabel,
    buttons: buildInitialRandomEventPromptButtons({ eventId, selection }),
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

  const openedWindow =
    flow.type === "single-resolution"
      ? windowManager.openWindow({
          windowId: eventId,
          durationMs: claimWindowDurationMs,
          policy: selection.scenario.claimPolicy,
          maxParticipants: selection.scenario.requiredReadyCount,
          callbacks: {
            onResolved: async (context) => {
              await onResolved(eventId, context);
            },
          },
        })
      : null;

  copyVarietyState(contentState, candidateVarietyState);
  activeEventsById.set(eventId, {
    eventId,
    selection,
    message,
    flowState:
      flow.type === "single-resolution"
        ? { type: "single-resolution" }
        : flow.type === "solo-ladder"
          ? {
              type: "solo-ladder",
              ownerUserId: null,
              stageIndex: 0,
              resolvedLines: [],
            }
          : flow.type === "solo-push-your-luck"
            ? {
                type: "solo-push-your-luck",
                ownerUserId: null,
                stageIndex: 0,
                resolvedLines: [],
                potEffects: [],
              }
            : flow.type === "group-meter"
              ? {
                  type: "group-meter",
                  stageIndex: 0,
                  stageProgress: 0,
                  resolvedLines: [],
                  participantUserIds: new Set(),
                  currentStageContributorUserIds: new Set(),
                  currentStageAttemptedUserIds: new Set(),
                }
              : {
                  type: "stake-offer",
                  ownerUserId: null,
                },
    sequenceChallenge: null,
    phaseTimer: null,
    baseDurationMs: claimWindowDurationMs,
    currentPhaseExpiresAtMs: openedWindow?.expiresAtMs ?? estimatedExpiresAtMs,
    attemptedUserIds: new Set(),
    failedAttemptLines: [],
    failedAttemptUserIds: new Set(),
  });

  return {
    created: true,
    eventId,
    expiresAt: new Date(openedWindow?.expiresAtMs ?? estimatedExpiresAtMs),
  };
};
