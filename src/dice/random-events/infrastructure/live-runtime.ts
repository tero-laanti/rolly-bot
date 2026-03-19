import type { ButtonInteraction, Client } from "discord.js";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { getDatabase } from "../../../shared/db";
import { createSqliteDiceHostileEffectsService } from "../../progression/infrastructure/sqlite/hostile-effects-service";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";
import { createRandomEventContentState, getRandomEventRetryPolicy } from "../domain/content";
import type { RandomEventClaimPolicy } from "../domain/claim-policy";
import {
  advanceRollChallengeStep,
  createRollChallengeProgress,
  type RandomEventRollChallengeDefinition,
  type RandomEventRollChallengeProgress,
} from "../domain/roll-challenges";
import type { RandomEventRarityTier } from "../domain/variety";
import {
  buildRandomEventClaimButtonId,
  buildRandomEventClaimPrompt,
  createRandomEventInteractionWindowManager,
  parseRandomEventClaimButtonId,
  type RandomEventInteractionWindowLifecycleContext,
} from "../interfaces/discord/interaction-window";
import type { TriggerOpportunityResult } from "./foundation-scheduler";
import {
  buildActiveClaimDescription,
  buildClaimActivityLine,
  buildSequenceChallengeButtonLabel,
  buildSequenceChallengeDescription,
  getRandomEventEmbedTitle,
  getRandomEventRarityPresentation,
} from "./live-runtime-presentation";
import {
  resolveRandomEvent,
  resolveRandomEventAttempt,
  type RandomEventAttemptResolution,
} from "./live-runtime-resolution";
import {
  getActiveRandomEventCappedCurrentPhaseExpiryMs,
  getActiveRandomEventCurrentPhaseExpiryDate,
  getActiveRandomEventCurrentPhaseExpiryMs,
  getActiveRandomEventRemainingCurrentPhaseDurationMs,
  syncActiveRandomEventCurrentPhaseExpiryMs,
} from "./live-runtime-expiry";
import { triggerRandomEventOpportunity } from "./live-runtime-trigger";
import type {
  ActiveRandomEventContext,
  ActiveRandomEventSequenceChallenge,
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

const sequenceChallengeMinDurationMs = 20_000;
const sequenceChallengeMaxDurationMs = 60_000;
const clickCooldownMs = 2_000;

const getSequenceChallengeDurationMs = (challenge: RandomEventRollChallengeDefinition): number => {
  return Math.min(
    sequenceChallengeMaxDurationMs,
    Math.max(sequenceChallengeMinDurationMs, challenge.steps.length * 12_000),
  );
};

const getSequenceChallenge = (
  context: ActiveRandomEventContext | undefined,
): {
  challenge: RandomEventRollChallengeDefinition;
  session: ActiveRandomEventSequenceChallenge;
} | null => {
  if (!context?.sequenceChallenge) {
    return null;
  }

  const challenge = context.selection.scenario.rollChallenge;
  if (!challenge || challenge.mode !== "sequence") {
    return null;
  }

  return {
    challenge,
    session: context.sequenceChallenge,
  };
};

const clearSequenceChallengeTimer = (context: ActiveRandomEventContext | undefined): void => {
  if (!context?.sequenceChallenge) {
    return;
  }

  clearTimeout(context.sequenceChallenge.timer);
};

export const createRandomEventsLiveRuntime = ({
  client,
  config,
  state,
  logger = console,
}: CreateRandomEventsLiveRuntimeInput): RandomEventsLiveRuntime => {
  const contentState = createRandomEventContentState();
  const activeEventsById = new Map<string, ActiveRandomEventContext>();
  const clickCooldownByUserId = new Map<string, number>();
  let nextSequenceChallengeSessionId = 1;
  const db = getDatabase();
  const progression = createSqliteProgressionRepository(db);
  const hostileEffects = createSqliteDiceHostileEffectsService(db);

  const windowManager = createRandomEventInteractionWindowManager({
    logger,
  });

  const isWithinClickCooldown = (userId: string): boolean => {
    const lastClickAtMs = clickCooldownByUserId.get(userId) ?? 0;
    const nowMs = Date.now();
    if (nowMs - lastClickAtMs < clickCooldownMs) {
      return true;
    }

    clickCooldownByUserId.set(userId, nowMs);
    return false;
  };

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
        getActiveRandomEventCurrentPhaseExpiryMs(context),
        windowSnapshot?.participants ?? [],
        context.failedAttemptLines,
        context.selection.scenario.requiredReadyCount ?? null,
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

  const refreshSequenceChallengePrompt = async (eventId: string): Promise<void> => {
    const context = activeEventsById.get(eventId);
    const sequenceContext = getSequenceChallenge(context);
    if (!context || !sequenceContext) {
      return;
    }

    const { challenge, session } = sequenceContext;
    const rarityPresentation = getRandomEventRarityPresentation(context.selection.scenario.rarity);
    const prompt = buildRandomEventClaimPrompt({
      title: getRandomEventEmbedTitle(context.selection.scenario, context.selection.renderedTitle),
      description: buildSequenceChallengeDescription({
        selection: context.selection,
        userId: session.userId,
        challenge,
        progress: session.progress,
        expiresAtMs: getActiveRandomEventCurrentPhaseExpiryMs(context),
      }),
      buttonCustomId: buildRandomEventClaimButtonId(eventId),
      buttonLabel: buildSequenceChallengeButtonLabel(session.progress, challenge.steps.length),
      color: rarityPresentation.color,
      footerText: `${rarityPresentation.label} • Challenge`,
    });

    await context.message.edit(prompt).catch((error) => {
      logger.warn("[random-events] Failed to refresh staged challenge prompt.", error);
    });
  };

  const resolveEvent = async ({
    eventId,
    participants,
    challengeProgressByUserId,
    resolutionNotesByUserId,
    attemptResolutionsByUserId,
  }: {
    eventId: string;
    participants: string[];
    challengeProgressByUserId?: ReadonlyMap<string, RandomEventRollChallengeProgress>;
    resolutionNotesByUserId?: ReadonlyMap<string, string>;
    attemptResolutionsByUserId?: ReadonlyMap<string, RandomEventAttemptResolution>;
  }): Promise<void> => {
    const context = activeEventsById.get(eventId);
    clearSequenceChallengeTimer(context);
    if (context) {
      context.sequenceChallenge = null;
    }

    await resolveRandomEvent({
      activeEventsById,
      state,
      progression,
      hostileEffects,
      eventId,
      participants,
      challengeProgressByUserId,
      resolutionNotesByUserId,
      attemptResolutionsByUserId,
    });
  };

  const onClaimWindowResolved = async (
    eventId: string,
    lifecycle: RandomEventInteractionWindowLifecycleContext,
  ): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    const participants = lifecycle.snapshot.participants;
    if (lifecycle.reason === "expired") {
      await resolveEvent({ eventId, participants });
      return;
    }

    const challenge = context.selection.scenario.rollChallenge;
    if (
      participants.length === 1 &&
      context.selection.scenario.claimPolicy === "first-click" &&
      challenge?.mode === "sequence"
    ) {
      await startSequenceChallenge(eventId, participants[0] as string);
      return;
    }

    if (participants.length === 1 && context.selection.scenario.claimPolicy === "first-click") {
      await processFirstClickAttempt({
        eventId,
        userId: participants[0] as string,
      });
      return;
    }

    await resolveEvent({ eventId, participants });
  };

  const reopenFirstClickEvent = async (eventId: string): Promise<boolean> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return false;
    }

    const remainingDurationMs = getActiveRandomEventRemainingCurrentPhaseDurationMs(context);
    if (remainingDurationMs < 1) {
      return false;
    }

    const snapshot = windowManager.openWindow({
      windowId: eventId,
      durationMs: remainingDurationMs,
      policy: "first-click",
      callbacks: {
        onResolved: async (lifecycle) => {
          await onClaimWindowResolved(eventId, lifecycle);
        },
      },
    });

    syncActiveRandomEventCurrentPhaseExpiryMs(state, context, snapshot.expiresAtMs);
    await refreshActiveEventPrompt(eventId, null);
    return true;
  };

  const processFirstClickAttempt = async ({
    eventId,
    userId,
    challengeProgress,
    resolutionNote,
  }: {
    eventId: string;
    userId: string;
    challengeProgress?: RandomEventRollChallengeProgress | null;
    resolutionNote?: string | null;
  }): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    const attemptResolution = resolveRandomEventAttempt({
      progression,
      hostileEffects,
      selection: context.selection,
      userId,
      challengeProgress,
      resolutionNote,
    });

    if (attemptResolution.resolution === "keep-open-failure") {
      context.attemptedUserIds.add(userId);
      context.failedAttemptLines.push(attemptResolution.failedAttemptLine);
      clearSequenceChallengeTimer(context);
      context.sequenceChallenge = null;

      const reopened = await reopenFirstClickEvent(eventId);
      if (!reopened) {
        await resolveEvent({
          eventId,
          participants: [],
        });
      }
      return;
    }

    await resolveEvent({
      eventId,
      participants: [userId],
      attemptResolutionsByUserId: new Map([[userId, attemptResolution]]),
    });
  };

  const sequenceChallengeTimeoutResolutionNote =
    "⏱️ The remaining rolls were resolved automatically when time ran out.";

  const completeSequenceChallengeProgress = ({
    challenge,
    progress,
    userId,
  }: {
    challenge: RandomEventRollChallengeDefinition;
    progress: RandomEventRollChallengeProgress;
    userId: string;
  }): RandomEventRollChallengeProgress => {
    let nextProgress = progress;
    while (!nextProgress.completed) {
      nextProgress = advanceRollChallengeStep({
        playerDice: progression,
        userId,
        challenge,
        progress: nextProgress,
      });
    }

    return nextProgress;
  };

  const autoResolveSequenceChallenge = async (
    eventId: string,
    sequenceSessionId: number,
  ): Promise<void> => {
    const context = activeEventsById.get(eventId);
    const sequenceContext = getSequenceChallenge(context);
    if (!context || !sequenceContext) {
      return;
    }

    const { challenge, session } = sequenceContext;
    if (session.sessionId !== sequenceSessionId) {
      return;
    }

    const progress = completeSequenceChallengeProgress({
      challenge,
      progress: session.progress,
      userId: session.userId,
    });

    context.sequenceChallenge = {
      ...session,
      progress,
    };

    await processFirstClickAttempt({
      eventId,
      userId: session.userId,
      challengeProgress: progress,
      resolutionNote: sequenceChallengeTimeoutResolutionNote,
    });
  };

  const startSequenceChallenge = async (eventId: string, userId: string): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    const challenge = context.selection.scenario.rollChallenge;
    if (!challenge || challenge.mode !== "sequence") {
      await processFirstClickAttempt({
        eventId,
        userId,
      });
      return;
    }

    const progress = createRollChallengeProgress(challenge);
    const nowMs = Date.now();
    const expiresAtMs = getActiveRandomEventCappedCurrentPhaseExpiryMs(
      context,
      getSequenceChallengeDurationMs(challenge),
      nowMs,
    );

    if (expiresAtMs === null) {
      await processFirstClickAttempt({
        eventId,
        userId,
        challengeProgress: completeSequenceChallengeProgress({
          challenge,
          progress,
          userId,
        }),
        resolutionNote: sequenceChallengeTimeoutResolutionNote,
      });
      return;
    }

    const durationMs = expiresAtMs - nowMs;
    const sessionId = nextSequenceChallengeSessionId;
    nextSequenceChallengeSessionId += 1;
    const timer = setTimeout(() => {
      void autoResolveSequenceChallenge(eventId, sessionId).catch((error) => {
        logger.warn("[random-events] Failed to auto-resolve staged challenge.", error);
      });
    }, durationMs);

    context.sequenceChallenge = {
      sessionId,
      userId,
      progress,
      timer,
    };

    syncActiveRandomEventCurrentPhaseExpiryMs(state, context, expiresAtMs);
    await refreshSequenceChallengePrompt(eventId);
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
      onResolved: async (eventId, lifecycle) => {
        await onClaimWindowResolved(eventId, lifecycle);
      },
    });
  };

  const handleButtonInteraction = async (interaction: ButtonInteraction): Promise<void> => {
    const eventId = parseRandomEventClaimButtonId(interaction.customId);
    if (!eventId) {
      await interaction.deferUpdate();
      return;
    }

    if (isWithinClickCooldown(interaction.user.id)) {
      await interaction.reply({
        content: "Slow down a bit. Wait 2 seconds before clicking again.",
        ephemeral: true,
      });
      return;
    }

    const activeContext = activeEventsById.get(eventId);
    const sequenceContext = getSequenceChallenge(activeContext);
    if (activeContext && sequenceContext) {
      const { challenge, session } = sequenceContext;

      if (interaction.user.id !== session.userId) {
        await interaction.reply({
          content: "Too late — this challenge belongs to someone else.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferUpdate();

      if (Date.now() >= getActiveRandomEventCurrentPhaseExpiryMs(activeContext)) {
        await autoResolveSequenceChallenge(eventId, session.sessionId);
        return;
      }

      const nextProgress = advanceRollChallengeStep({
        playerDice: progression,
        userId: session.userId,
        challenge,
        progress: session.progress,
      });

      activeContext.sequenceChallenge = {
        ...session,
        progress: nextProgress,
      };

      if (nextProgress.completed) {
        await processFirstClickAttempt({
          eventId,
          userId: session.userId,
          challengeProgress: nextProgress,
        });
        return;
      }

      await refreshSequenceChallengePrompt(eventId);
      return;
    }

    const retryPolicy = activeContext
      ? getRandomEventRetryPolicy(activeContext.selection.scenario)
      : null;
    if (
      activeContext?.selection.scenario.claimPolicy === "first-click" &&
      retryPolicy === "once-per-user" &&
      activeContext.attemptedUserIds.has(interaction.user.id)
    ) {
      await interaction.reply({
        content: "You already failed this one. Let someone else take a shot.",
        ephemeral: true,
      });
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
        content: "Too late — someone else is already attempting this.",
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
        const sequenceContext = getSequenceChallenge(context);
        const windowSnapshot = sequenceContext ? null : windowManager.getWindow(context.eventId);
        return {
          eventId: context.eventId,
          title: context.selection.renderedTitle,
          rarity: context.selection.scenario.rarity,
          claimPolicy: context.selection.scenario.claimPolicy,
          participantCount: sequenceContext ? 1 : (windowSnapshot?.participants.length ?? 0),
          expiresAt: getActiveRandomEventCurrentPhaseExpiryDate(context),
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
    clickCooldownByUserId.clear();
    for (const context of activeEventsById.values()) {
      clearSequenceChallengeTimer(context);
    }
    activeEventsById.clear();
  };

  return {
    onTriggerOpportunity,
    handleButtonInteraction,
    getActiveEventsSnapshot,
    stop,
  };
};
