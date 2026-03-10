import { randomUUID } from "node:crypto";
import { EmbedBuilder } from "discord.js";
import type { ButtonInteraction, Client, Message } from "discord.js";
import { getDatabase } from "../../../shared/db";
import { getDiceBalanceData } from "../../../rolly-data/load";
import { applyDiceTemporaryEffect } from "../../core/domain/temporary-effects";
import {
  applyShieldableNegativeLockout,
  applyShieldableNegativeRollPenalty,
} from "../../core/domain/hostile-effects";
import {
  createRandomEventContentState,
  renderRandomEventScenario,
  selectRandomEventOutcomeForScenario,
  selectRandomEventScenario,
  type RandomEventOutcome,
  type RandomEventScenario,
  type RandomEventSelectionResult,
} from "./content";
import { randomEventContentPackV1 } from "./content-pack-v1";
import {
  buildRandomEventClaimButtonId,
  buildRandomEventClaimPrompt,
  createRandomEventInteractionWindowManager,
  parseRandomEventClaimButtonId,
  type RandomEventClaimPolicy,
} from "./interaction-window";
import {
  resolveRollChallengeImmediately,
  type RandomEventRollChallengeProgress,
} from "./roll-challenges";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { resolveActiveRandomEvent, type RandomEventsState } from "./state";
import type { TriggerOpportunityResult } from "./scheduler";
import type { RandomEventRarityTier, RandomEventVarietyState } from "./variety";

type RandomEventsLiveRuntimeLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type CreateRandomEventsLiveRuntimeInput = {
  client: Client;
  config: RandomEventsFoundationConfig;
  state: RandomEventsState;
  logger?: RandomEventsLiveRuntimeLogger;
};

type ActiveRandomEventContext = {
  eventId: string;
  selection: RandomEventSelectionResult;
  message: Message;
};

type RandomEventUserResolution = {
  userId: string;
  renderedOutcomeMessage: string;
  challengeRollSummary: string | null;
  effectNotes: string[];
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

const randomEventRarityPresentation: Record<
  RandomEventRarityTier,
  { label: string; color: number }
> = {
  common: { label: "Common Event", color: 0x95a5a6 },
  uncommon: { label: "Uncommon Event", color: 0x2ecc71 },
  rare: { label: "Rare Event", color: 0x3498db },
  epic: { label: "Epic Event", color: 0x9b59b6 },
  legendary: { label: "Legendary Event", color: 0xf1c40f },
};

const formatRelativeTimestamp = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
};

const getRandomEventEmbedTitle = (scenario: RandomEventScenario, renderedTitle: string): string => {
  return `${randomEventRarityPresentation[scenario.rarity].label} • ${renderedTitle}`;
};

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

const applyOutcomeEffectsToUser = (
  userId: string,
  scenario: RandomEventScenario,
  outcome: RandomEventOutcome,
): string[] => {
  const db = getDatabase();
  const effectNotes: string[] = [];

  for (const effect of outcome.effects) {
    if (effect.type === "currency") {
      continue;
    }

    if (effect.type === "temporary-roll-multiplier") {
      applyDiceTemporaryEffect(db, {
        userId,
        effectCode: "roll-pass-multiplier",
        kind: "positive",
        source: `random-event:${scenario.id}:${outcome.id}`,
        magnitude: effect.multiplier,
        remainingRolls: effect.rolls,
        consumeOnCommand: "dice",
        stackGroup: "roll-pass-multiplier",
        stackMode: effect.stackMode,
      });
      continue;
    }

    if (effect.type === "temporary-roll-penalty") {
      const result = applyShieldableNegativeRollPenalty(db, {
        userId,
        source: `random-event:${scenario.id}:${outcome.id}`,
        divisor: effect.divisor,
        rolls: effect.rolls,
        stackMode: effect.stackMode,
      });
      if (result.blockedByShield) {
        effectNotes.push("Bad Luck Umbrella blocked a negative event effect.");
      }
      continue;
    }

    const result = applyShieldableNegativeLockout(db, {
      userId,
      durationMs: effect.durationMinutes * 60_000,
      nowMs: Date.now(),
    });
    if (result.blockedByShield) {
      effectNotes.push("Bad Luck Umbrella blocked a negative event effect.");
    }
  }

  return effectNotes;
};

const formatChallengeRollSummary = (
  challengeProgress: RandomEventRollChallengeProgress | null,
): string | null => {
  if (!challengeProgress || challengeProgress.stepResults.length < 1) {
    return null;
  }

  const rollSummary = challengeProgress.stepResults
    .map((stepResult) => `${stepResult.rolledValue} (d${stepResult.dieSides})`)
    .join(" → ");

  return `🎲 You rolled: ${rollSummary}`;
};

const toActionText = (claimLabel: string): string => {
  const normalized = claimLabel.trim();
  if (normalized.length < 1) {
    return "join";
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
};

const pickRandomTemplate = (templates: string[]): string | null => {
  if (templates.length < 1) {
    return null;
  }

  const index = Math.floor(Math.random() * templates.length);
  return templates[index] ?? templates[0] ?? null;
};

const buildClaimActivityLine = (
  scenario: RandomEventScenario,
  userId: string,
  claimLabel: string,
  mode: "did" | "already-ready",
): string => {
  const templates = scenario.activityTemplates;
  const selectedTemplate = templates
    ? pickRandomTemplate(mode === "already-ready" ? templates.alreadyReady : templates.accepted)
    : null;

  if (selectedTemplate) {
    return selectedTemplate.replaceAll("{userId}", userId);
  }

  const actionText = toActionText(claimLabel);
  if (mode === "already-ready") {
    return `<@${userId}> is already ready to ${actionText}.`;
  }

  return `<@${userId}> did ${actionText}.`;
};

const buildActiveClaimDescription = (
  prompt: string,
  activityLine: string | null,
  expiresAtMs: number | null,
): string => {
  const lines = [prompt];

  if (activityLine) {
    lines.push("", activityLine);
  }

  if (typeof expiresAtMs === "number") {
    lines.push("", `⏳ Ends ${formatRelativeTimestamp(expiresAtMs)}.`);
  }

  return lines.join("\n");
};

const buildResolvedEventEmbed = (
  selection: RandomEventSelectionResult,
  lines: string[],
): EmbedBuilder => {
  const rarityPresentation = randomEventRarityPresentation[selection.scenario.rarity];
  return new EmbedBuilder()
    .setTitle(getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle))
    .setDescription([selection.renderedPrompt, "", "**Outcome:**", ...lines].join("\n"))
    .setColor(rarityPresentation.color)
    .setFooter({ text: `${rarityPresentation.label} • Resolved` });
};

const buildExpiredEventEmbed = (selection: RandomEventSelectionResult): EmbedBuilder => {
  const rarityPresentation = randomEventRarityPresentation[selection.scenario.rarity];
  return new EmbedBuilder()
    .setTitle(getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle))
    .setDescription([selection.renderedPrompt, "", "No one claimed this event in time."].join("\n"))
    .setColor(rarityPresentation.color)
    .setFooter({ text: `${rarityPresentation.label} • Expired` });
};

export const createRandomEventsLiveRuntime = ({
  client,
  config,
  state,
  logger = console,
}: CreateRandomEventsLiveRuntimeInput): RandomEventsLiveRuntime => {
  const contentState = createRandomEventContentState();
  const activeEventsById = new Map<string, ActiveRandomEventContext>();

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
    const rarityPresentation = randomEventRarityPresentation[context.selection.scenario.rarity];

    const prompt = buildRandomEventClaimPrompt({
      title: getRandomEventEmbedTitle(context.selection.scenario, context.selection.renderedTitle),
      description: buildActiveClaimDescription(
        context.selection.renderedPrompt,
        activityLine,
        windowSnapshot?.expiresAtMs ?? null,
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

  const resolveEvent = async (eventId: string, participants: string[]): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      resolveActiveRandomEvent(state, eventId);
      return;
    }

    activeEventsById.delete(eventId);
    resolveActiveRandomEvent(state, eventId);

    if (participants.length < 1) {
      await context.message.edit({
        content: "",
        embeds: [buildExpiredEventEmbed(context.selection).toJSON()],
        components: [],
      });
      return;
    }

    const participantsToResolve =
      context.selection.scenario.claimPolicy === "first-click"
        ? [participants[0] as string]
        : participants;

    const userResolutions: RandomEventUserResolution[] = [];
    for (const userId of participantsToResolve) {
      let outcome = context.selection.selectedOutcome;
      let challengeProgress: RandomEventRollChallengeProgress | null = null;

      if (context.selection.scenario.rollChallenge) {
        challengeProgress = resolveRollChallengeImmediately(
          getDatabase(),
          userId,
          context.selection.scenario.rollChallenge,
        );

        const challengeResult = challengeProgress.succeeded ? "success" : "failure";
        const challengeOutcome = selectRandomEventOutcomeForScenario(context.selection.scenario, {
          challengeResult,
        });
        if (challengeOutcome) {
          outcome = challengeOutcome;
        }
      }

      const renderedOutcome = renderRandomEventScenario(context.selection.scenario, outcome, {
        textVariableValues: context.selection.textVariableValues,
      });
      const effectNotes = applyOutcomeEffectsToUser(userId, context.selection.scenario, outcome);

      userResolutions.push({
        userId,
        renderedOutcomeMessage: renderedOutcome.renderedOutcomeMessage,
        challengeRollSummary: formatChallengeRollSummary(challengeProgress),
        effectNotes,
      });
    }

    const lines = userResolutions.map((resolution) => {
      const noteText =
        resolution.effectNotes.length > 0 ? ` ${resolution.effectNotes.join(" ")}` : "";
      if (resolution.challengeRollSummary) {
        return `<@${resolution.userId}>: ${resolution.challengeRollSummary}. ${resolution.renderedOutcomeMessage}${noteText}`;
      }

      return `<@${resolution.userId}>: ${resolution.renderedOutcomeMessage}${noteText}`;
    });

    await context.message.edit({
      content: "",
      embeds: [buildResolvedEventEmbed(context.selection, lines).toJSON()],
      components: [],
    });
  };

  const onTriggerOpportunity = async (context: {
    now: Date;
    requiredClaimPolicy?: RandomEventClaimPolicy;
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

    const randomEventBalance = getDiceBalanceData().randomEvents;
    const candidateVarietyState = cloneVarietyState(contentState);
    const candidateScenarios =
      context.requiredClaimPolicy === undefined
        ? randomEventContentPackV1
        : randomEventContentPackV1.filter(
            (scenario) => scenario.claimPolicy === context.requiredClaimPolicy,
          );
    const selection = selectRandomEventScenario(candidateScenarios, candidateVarietyState, {
      antiRepeatCooldownTriggers: randomEventBalance.variety.antiRepeatCooldownTriggers,
      rarityChances: randomEventBalance.variety.rarityChances,
      rarityWeightMultipliers: randomEventBalance.variety.rarityWeightMultipliers,
      pity: randomEventBalance.variety.pity,
    });

    if (!selection) {
      return { created: false };
    }

    const eventId = `random-event:${randomUUID()}`;
    const claimWindowDurationMs =
      selection.scenario.claimWindowSeconds *
      1_000 *
      randomEventBalance.claimWindowDurationMultiplier;
    const estimatedExpiresAtMs = Date.now() + claimWindowDurationMs;
    const rarityPresentation = randomEventRarityPresentation[selection.scenario.rarity];
    const prompt = buildRandomEventClaimPrompt({
      title: getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle),
      description: buildActiveClaimDescription(
        selection.renderedPrompt,
        null,
        estimatedExpiresAtMs,
      ),
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
    });

    windowManager.openWindow({
      windowId: eventId,
      durationMs: claimWindowDurationMs,
      policy: selection.scenario.claimPolicy,
      callbacks: {
        onResolved: async ({ snapshot }) => {
          await resolveEvent(eventId, snapshot.participants);
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
