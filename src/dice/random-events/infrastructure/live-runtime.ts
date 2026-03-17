import type { ButtonInteraction, Client } from "discord.js";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { getDatabase } from "../../../shared/db";
import { createSqliteDiceHostileEffectsService } from "../../progression/infrastructure/sqlite/hostile-effects-service";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";
import { createRandomEventContentState } from "../domain/content";
import type { RandomEventClaimPolicy } from "../domain/claim-policy";
import {
  advanceRollChallengeStep,
  createRollChallengeProgress,
  type RandomEventRollChallengeDefinition,
} from "../domain/roll-challenges";
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
  buildSequenceChallengeButtonLabel,
  buildSequenceChallengeDescription,
  getRandomEventEmbedTitle,
  getRandomEventRarityPresentation,
} from "./live-runtime-presentation";
import { resolveRandomEvent } from "./live-runtime-resolution";
import { triggerRandomEventOpportunity } from "./live-runtime-trigger";
import type {
  ActiveRandomEventContext,
  ActiveRandomEventSequenceChallenge,
  RandomEventsLiveRuntimeLogger,
} from "./live-runtime-types";
import { type RandomEventsState, updateActiveRandomEventExpiry } from "./state-store";

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

const getSequenceChallengeDurationMs = (challenge: RandomEventRollChallengeDefinition): number => {
  return Math.min(60_000, Math.max(20_000, challenge.steps.length * 12_000));
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
        expiresAtMs: session.expiresAtMs,
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
  }: {
    eventId: string;
    participants: string[];
    challengeProgressByUserId?: ReadonlyMap<string, ReturnType<typeof createRollChallengeProgress>>;
    resolutionNotesByUserId?: ReadonlyMap<string, string>;
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
    });
  };

  const autoResolveSequenceChallenge = async (eventId: string): Promise<void> => {
    const context = activeEventsById.get(eventId);
    const sequenceContext = getSequenceChallenge(context);
    if (!context || !sequenceContext) {
      return;
    }

    const { challenge, session } = sequenceContext;
    let progress = session.progress;
    while (!progress.completed) {
      progress = advanceRollChallengeStep({
        playerDice: progression,
        userId: session.userId,
        challenge,
        progress,
      });
    }

    context.sequenceChallenge = {
      ...session,
      progress,
    };

    await resolveEvent({
      eventId,
      participants: [session.userId],
      challengeProgressByUserId: new Map([[session.userId, progress]]),
      resolutionNotesByUserId: new Map([
        [session.userId, "⏱️ The remaining rolls were resolved automatically when time ran out."],
      ]),
    });
  };

  const startSequenceChallenge = async (eventId: string, userId: string): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    const challenge = context.selection.scenario.rollChallenge;
    if (!challenge || challenge.mode !== "sequence") {
      await resolveEvent({
        eventId,
        participants: [userId],
      });
      return;
    }

    const durationMs = getSequenceChallengeDurationMs(challenge);
    const expiresAtMs = Date.now() + durationMs;
    const timer = setTimeout(() => {
      void autoResolveSequenceChallenge(eventId);
    }, durationMs);

    context.sequenceChallenge = {
      userId,
      progress: createRollChallengeProgress(challenge),
      expiresAtMs,
      timer,
    };

    updateActiveRandomEventExpiry(state, eventId, new Date(expiresAtMs));
    await refreshSequenceChallengePrompt(eventId);
  };

  const onClaimWindowResolved = async (eventId: string, participants: string[]): Promise<void> => {
    const context = activeEventsById.get(eventId);
    const challenge = context?.selection.scenario.rollChallenge;

    if (
      context &&
      participants.length === 1 &&
      context.selection.scenario.claimPolicy === "first-click" &&
      challenge?.mode === "sequence"
    ) {
      await startSequenceChallenge(eventId, participants[0] as string);
      return;
    }

    await resolveEvent({ eventId, participants });
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
        await onClaimWindowResolved(eventId, participants);
      },
    });
  };

  const handleButtonInteraction = async (interaction: ButtonInteraction): Promise<void> => {
    const eventId = parseRandomEventClaimButtonId(interaction.customId);
    if (!eventId) {
      await interaction.deferUpdate();
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

      if (Date.now() >= session.expiresAtMs) {
        await autoResolveSequenceChallenge(eventId);
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
        await resolveEvent({
          eventId,
          participants: [session.userId],
          challengeProgressByUserId: new Map([[session.userId, nextProgress]]),
        });
        return;
      }

      await refreshSequenceChallengePrompt(eventId);
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
        const sequenceContext = getSequenceChallenge(context);
        const windowSnapshot = sequenceContext ? null : windowManager.getWindow(context.eventId);
        return {
          eventId: context.eventId,
          title: context.selection.renderedTitle,
          rarity: context.selection.scenario.rarity,
          claimPolicy: context.selection.scenario.claimPolicy,
          participantCount: sequenceContext ? 1 : (windowSnapshot?.participants.length ?? 0),
          expiresAt: sequenceContext
            ? new Date(sequenceContext.session.expiresAtMs)
            : windowSnapshot
              ? new Date(windowSnapshot.expiresAtMs)
              : null,
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
