import type { ButtonInteraction, Client } from "discord.js";
import { publishAchievementAnnouncements } from "../../../app/discord/achievement-announcements";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { getDatabase } from "../../../shared/db";
import {
  discordEmbedDescriptionCharacterLimit,
  formatDiscordRelativeTime,
  truncateDiscordText,
} from "../../../shared/discord";
import { createSqliteEconomyRepository } from "../../economy/infrastructure/sqlite/balance-repository";
import {
  createDiceShopCatalog,
  createSqliteInventoryRepository,
} from "../../inventory/infrastructure/sqlite/inventory-repository";
import { awardManualDiceAchievements } from "../../progression/application/achievement-awards";
import {
  createAchievementAnnouncement,
  type AchievementAnnouncement,
} from "../../progression/application/achievement-announcements";
import { createSqliteDiceHostileEffectsService } from "../../progression/infrastructure/sqlite/hostile-effects-service";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";
import { createSqlitePvpRepository } from "../../pvp/infrastructure/sqlite/pvp-repository";
import { getRandomEventAchievementIds } from "../application/achievement-rules";
import {
  createRandomEventContentState,
  getRandomEventFlow,
  getRandomEventRetryPolicy,
  type RandomEventEffect,
} from "../domain/content";
import type { RandomEventClaimPolicy } from "../domain/claim-policy";
import {
  advanceRollChallengeStep,
  createRollChallengeProgress,
  resolveRollChallengeImmediately,
  type RandomEventRollChallengeDefinition,
  type RandomEventRollChallengeProgress,
} from "../domain/roll-challenges";
import type { RandomEventRarityTier } from "../domain/variety";
import {
  buildRandomEventActionButtonId,
  buildRandomEventClaimButtonId,
  buildRandomEventClaimPrompt,
  createRandomEventInteractionWindowManager,
  parseRandomEventActionButtonId,
  type RandomEventPromptButton,
  type RandomEventInteractionWindowLifecycleContext,
} from "../interfaces/discord/interaction-window";
import type { TriggerOpportunityResult } from "./foundation-scheduler";
import {
  buildActiveClaimDescription,
  buildActiveClaimButtonLabel,
  buildClaimActivityLine,
  buildExpiredEventEmbed,
  buildResolvedEventEmbed,
  buildSequenceChallengeButtonLabel,
  buildSequenceChallengeDescription,
  getRandomEventEmbedTitle,
  getRandomEventRarityPresentation,
} from "./live-runtime-presentation";
import {
  applyRandomEventEffectsToUser,
  resolveRandomEvent,
  resolveRandomEventCurrencyEffectAmounts,
  resolveRandomEventAttempt,
  type RandomEventAttemptResolution,
} from "./live-runtime-resolution";
import { recordRandomEventAchievementStats } from "./achievement-stats-repository";
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
  ActiveRandomEventFlowState,
  ActiveRandomEventSequenceChallenge,
  RandomEventsLiveRuntimeLogger,
} from "./live-runtime-types";
import { resolveActiveRandomEvent, type RandomEventsState } from "./state-store";

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

const formatEffectPreview = (effects: RandomEventEffect[]): string => {
  const parts = effects.flatMap((effect) => {
    if (effect.type === "currency") {
      return effect.minAmount === effect.maxAmount
        ? [`${effect.minAmount} pip${effect.minAmount === 1 ? "" : "s"}`]
        : [`${effect.minAmount}-${effect.maxAmount} pips`];
    }

    if (effect.type === "consumable-item") {
      return [`${effect.quantity}x ${effect.itemId}`];
    }

    if (effect.type === "temporary-roll-multiplier") {
      return [`x${effect.multiplier} for ${effect.rolls} rolls`];
    }

    if (effect.type === "temporary-roll-penalty") {
      return [`/${effect.divisor} for ${effect.rolls} rolls`];
    }

    return [`lockout ${effect.durationMinutes}m`];
  });

  return parts.length > 0 ? parts.join(", ") : "no reward";
};

const formatChallengeProgressSummary = (
  progress: RandomEventRollChallengeProgress,
): string | null => {
  if (progress.stepResults.length < 1) {
    return null;
  }

  const rollSummary = progress.stepResults
    .map((stepResult) => `${stepResult.rolledValue} (d${stepResult.dieSides})`)
    .join(" → ");
  return `Rolled ${rollSummary}`;
};

const buildStagedFlowDescription = ({
  prompt,
  stageLabel,
  stagePrompt,
  statusLines,
  resolvedLines,
  failedAttemptLines,
  expiresAtMs,
}: {
  prompt: string;
  stageLabel: string | null;
  stagePrompt: string;
  statusLines: string[];
  resolvedLines: string[];
  failedAttemptLines: string[];
  expiresAtMs: number | null;
}): string => {
  const lines = [prompt, "", `**Current stage:** ${stageLabel ?? "Offer"}`, stagePrompt];

  if (statusLines.length > 0) {
    lines.push("", ...statusLines);
  }

  if (resolvedLines.length > 0) {
    lines.push("", "**Resolved so far:**", ...resolvedLines.slice(-4));
  }

  if (failedAttemptLines.length > 0) {
    lines.push("", "**Recent setbacks:**", ...failedAttemptLines.slice(-3));
  }

  if (typeof expiresAtMs === "number") {
    lines.push("", `⏳ Ends ${formatDiscordRelativeTime(expiresAtMs)}.`);
  }

  return truncateDiscordText(
    lines.join("\n"),
    discordEmbedDescriptionCharacterLimit,
    "\n... (truncated)",
  );
};

const clearSequenceChallengeTimer = (context: ActiveRandomEventContext | undefined): void => {
  if (!context?.sequenceChallenge) {
    return;
  }

  clearTimeout(context.sequenceChallenge.timer);
};

const clearPhaseTimer = (context: ActiveRandomEventContext | undefined): void => {
  if (!context?.phaseTimer) {
    return;
  }

  clearTimeout(context.phaseTimer);
  context.phaseTimer = null;
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
  const economy = createSqliteEconomyRepository(db);
  const inventory = createSqliteInventoryRepository(db);
  const itemCatalog = createDiceShopCatalog();
  const progression = createSqliteProgressionRepository(db);
  const hostileEffects = createSqliteDiceHostileEffectsService(db);
  const pvp = createSqlitePvpRepository(db);

  const windowManager = createRandomEventInteractionWindowManager({
    logger,
  });

  const isWithinClickCooldown = (userId: string): boolean => {
    const lastClickAtMs = clickCooldownByUserId.get(userId) ?? 0;
    return Date.now() - lastClickAtMs < clickCooldownMs;
  };

  const startClickCooldown = (userId: string): void => {
    clickCooldownByUserId.set(userId, Date.now());
  };

  const schedulePhaseExpiry = (eventId: string, durationMs: number): void => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    clearPhaseTimer(context);
    const expiresAtMs = Date.now() + durationMs;
    context.currentPhaseExpiresAtMs = expiresAtMs;
    syncActiveRandomEventCurrentPhaseExpiryMs(state, context, expiresAtMs);
    context.phaseTimer = setTimeout(() => {
      void handleNonWindowPhaseExpiry(eventId).catch((error) => {
        logger.warn("[random-events] Failed to resolve staged phase timeout.", error);
      });
    }, durationMs);
  };

  const resetPhaseExpiry = (eventId: string): void => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    schedulePhaseExpiry(eventId, context.baseDurationMs);
  };

  const resolveCustomEvent = async (eventId: string, lines: string[]): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    clearSequenceChallengeTimer(context);
    clearPhaseTimer(context);
    activeEventsById.delete(eventId);
    resolveActiveRandomEvent(state, eventId);

    await context.message
      .edit({
        embeds: [buildResolvedEventEmbed(context.selection, lines).toJSON()],
        components: [],
      })
      .catch((error) => {
        logger.warn("[random-events] Failed to update resolved staged event message.", error);
      });
  };

  const expireCustomEvent = async (eventId: string, lines: string[] = []): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    clearSequenceChallengeTimer(context);
    clearPhaseTimer(context);
    activeEventsById.delete(eventId);
    resolveActiveRandomEvent(state, eventId);

    const embed =
      lines.length > 0
        ? buildResolvedEventEmbed(context.selection, [
            ...lines,
            "The event expired before the remaining rewards could be claimed.",
          ])
        : buildExpiredEventEmbed(context.selection, lines);
    await context.message
      .edit({
        embeds: [embed.toJSON()],
        components: [],
      })
      .catch((error) => {
        logger.warn("[random-events] Failed to update expired staged event message.", error);
      });
  };

  const getStageButtons = (
    eventId: string,
    flowState: ActiveRandomEventFlowState,
  ): RandomEventPromptButton[] => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return [];
    }

    const flow = getRandomEventFlow(context.selection.scenario);
    if (flow.type === "solo-ladder" && flowState.type === "solo-ladder") {
      const stage = flow.stages[flowState.stageIndex];
      if (!stage) {
        return [];
      }

      return [
        {
          customId: buildRandomEventActionButtonId(
            eventId,
            flowState.ownerUserId ? "continue" : "claim",
          ),
          label: stage.actionLabel ?? (flowState.ownerUserId ? "Continue" : "Claim"),
        },
      ];
    }

    if (flow.type === "solo-push-your-luck" && flowState.type === "solo-push-your-luck") {
      const stage = flow.stages[flowState.stageIndex];
      if (!stage) {
        return [
          {
            customId: buildRandomEventActionButtonId(eventId, "cash-out"),
            label: "Cash out",
          },
        ];
      }

      if (!flowState.ownerUserId) {
        return [
          {
            customId: buildRandomEventActionButtonId(eventId, "claim"),
            label: stage.actionLabel ?? "Claim",
          },
        ];
      }

      return [
        {
          customId: buildRandomEventActionButtonId(eventId, "continue"),
          label: stage.actionLabel ?? "Continue",
        },
        {
          customId: buildRandomEventActionButtonId(eventId, "cash-out"),
          label: "Cash out",
        },
      ];
    }

    if (flow.type === "group-meter" && flowState.type === "group-meter") {
      const stage = flow.stages[flowState.stageIndex];
      if (!stage) {
        return [];
      }

      return [
        {
          customId: buildRandomEventActionButtonId(eventId, "join"),
          label: stage.actionLabel ?? context.selection.renderedClaimLabel,
        },
      ];
    }

    if (flow.type === "stake-offer" && flowState.type === "stake-offer") {
      if (!flowState.ownerUserId) {
        return [
          {
            customId: buildRandomEventActionButtonId(eventId, "claim"),
            label: context.selection.renderedClaimLabel,
          },
        ];
      }

      return [
        {
          customId: buildRandomEventActionButtonId(eventId, "continue"),
          label: flow.acceptLabel ?? context.selection.renderedClaimLabel,
        },
        {
          customId: buildRandomEventActionButtonId(eventId, "cash-out"),
          label: flow.declineLabel,
        },
      ];
    }

    return [];
  };

  const refreshNonWindowPrompt = async (eventId: string): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    const flow = getRandomEventFlow(context.selection.scenario);
    const rarityPresentation = getRandomEventRarityPresentation(context.selection.scenario.rarity);
    const expiresAtMs = getActiveRandomEventCurrentPhaseExpiryMs(context);

    if (flow.type === "solo-ladder" && context.flowState.type === "solo-ladder") {
      const stage = flow.stages[context.flowState.stageIndex];
      if (!stage) {
        return;
      }

      const ownerLine = context.flowState.ownerUserId
        ? `<@${context.flowState.ownerUserId}> is on the ladder.`
        : "No one has claimed the ladder yet.";
      const prompt = buildRandomEventClaimPrompt({
        title: getRandomEventEmbedTitle(
          context.selection.scenario,
          context.selection.renderedTitle,
        ),
        description: buildStagedFlowDescription({
          prompt: context.selection.renderedPrompt,
          stageLabel: stage.label,
          stagePrompt: stage.prompt ?? stage.successMessage,
          statusLines: [
            ownerLine,
            `Up next: ${formatEffectPreview(stage.successEffects)}.`,
            `On failure: ${formatEffectPreview(stage.failureEffects ?? [])}.`,
          ],
          resolvedLines: context.flowState.resolvedLines,
          failedAttemptLines: context.failedAttemptLines,
          expiresAtMs,
        }),
        buttonCustomId: buildRandomEventClaimButtonId(eventId),
        buttonLabel: stage.actionLabel ?? "Continue",
        buttons: getStageButtons(eventId, context.flowState),
        color: rarityPresentation.color,
        footerText: `${rarityPresentation.label} • Ladder`,
      });
      await context.message.edit(prompt).catch((error) => {
        logger.warn("[random-events] Failed to refresh solo-ladder prompt.", error);
      });
      return;
    }

    if (flow.type === "solo-push-your-luck" && context.flowState.type === "solo-push-your-luck") {
      const stage = flow.stages[context.flowState.stageIndex] ?? null;
      const ownerLine = context.flowState.ownerUserId
        ? `<@${context.flowState.ownerUserId}> is holding the pot.`
        : "No one has started the run yet.";
      const prompt = buildRandomEventClaimPrompt({
        title: getRandomEventEmbedTitle(
          context.selection.scenario,
          context.selection.renderedTitle,
        ),
        description: buildStagedFlowDescription({
          prompt: context.selection.renderedPrompt,
          stageLabel: stage?.label ?? "Cash out",
          stagePrompt:
            stage?.prompt ?? "The run is complete. Cash out the pot before it goes cold.",
          statusLines: [
            ownerLine,
            `Current pot: ${formatEffectPreview(context.flowState.potEffects)}.`,
            stage
              ? `Next clear adds: ${formatEffectPreview(stage.successEffects)}.`
              : "Next clear adds: none.",
            stage
              ? `On failure: ${formatEffectPreview(stage.failureEffects ?? [])}.`
              : "On failure: lose the pot.",
          ],
          resolvedLines: context.flowState.resolvedLines,
          failedAttemptLines: context.failedAttemptLines,
          expiresAtMs,
        }),
        buttonCustomId: buildRandomEventClaimButtonId(eventId),
        buttonLabel: stage?.actionLabel ?? "Cash out",
        buttons: getStageButtons(eventId, context.flowState),
        color: rarityPresentation.color,
        footerText: `${rarityPresentation.label} • Push Your Luck`,
      });
      await context.message.edit(prompt).catch((error) => {
        logger.warn("[random-events] Failed to refresh push-your-luck prompt.", error);
      });
      return;
    }

    if (flow.type === "group-meter" && context.flowState.type === "group-meter") {
      const stage = flow.stages[context.flowState.stageIndex];
      if (!stage) {
        return;
      }

      const contributors = [...context.flowState.currentStageContributorUserIds];
      const prompt = buildRandomEventClaimPrompt({
        title: getRandomEventEmbedTitle(
          context.selection.scenario,
          context.selection.renderedTitle,
        ),
        description: buildStagedFlowDescription({
          prompt: context.selection.renderedPrompt,
          stageLabel: stage.label,
          stagePrompt:
            stage.prompt ??
            `Need ${stage.requiredSuccesses ?? "more"} successful joins to trigger the next reward.`,
          statusLines: [
            `Progress: ${context.flowState.stageProgress}/${stage.requiredSuccesses ?? context.flowState.stageProgress}.`,
            `Active line: ${
              context.flowState.participantUserIds.size > 0
                ? [...context.flowState.participantUserIds]
                    .map((userId) => `<@${userId}>`)
                    .join(", ")
                : "none yet"
            }.`,
            `Stage reward: ${formatEffectPreview(stage.successEffects)}.`,
            ...(stage.rollChallenge
              ? [`On failed join: ${formatEffectPreview(stage.failureEffects ?? [])}.`]
              : []),
            ...(contributors.length > 0
              ? [`Newest adds: ${contributors.map((userId) => `<@${userId}>`).join(", ")}.`]
              : []),
          ],
          resolvedLines: context.flowState.resolvedLines,
          failedAttemptLines: context.failedAttemptLines,
          expiresAtMs,
        }),
        buttonCustomId: buildRandomEventClaimButtonId(eventId),
        buttonLabel: stage.actionLabel ?? context.selection.renderedClaimLabel,
        buttons: getStageButtons(eventId, context.flowState),
        color: rarityPresentation.color,
        footerText: `${rarityPresentation.label} • Group Meter`,
      });
      await context.message.edit(prompt).catch((error) => {
        logger.warn("[random-events] Failed to refresh group-meter prompt.", error);
      });
      return;
    }

    if (flow.type === "stake-offer" && context.flowState.type === "stake-offer") {
      const ownerLine = context.flowState.ownerUserId
        ? `<@${context.flowState.ownerUserId}> is considering the offer.`
        : "No one has taken the deal yet.";
      const prompt = buildRandomEventClaimPrompt({
        title: getRandomEventEmbedTitle(
          context.selection.scenario,
          context.selection.renderedTitle,
        ),
        description: buildStagedFlowDescription({
          prompt: context.selection.renderedPrompt,
          stageLabel: "Offer",
          stagePrompt: ownerLine,
          statusLines: [`Stake: ${flow.stakePips} pips.`, flow.declineMessage],
          resolvedLines: [],
          failedAttemptLines: context.failedAttemptLines,
          expiresAtMs,
        }),
        buttonCustomId: buildRandomEventClaimButtonId(eventId),
        buttonLabel: context.selection.renderedClaimLabel,
        buttons: getStageButtons(eventId, context.flowState),
        color: rarityPresentation.color,
        footerText: `${rarityPresentation.label} • Wager Offer`,
      });
      await context.message.edit(prompt).catch((error) => {
        logger.warn("[random-events] Failed to refresh stake-offer prompt.", error);
      });
    }
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
    const participants = windowSnapshot?.participants ?? [];
    const rarityPresentation = getRandomEventRarityPresentation(context.selection.scenario.rarity);

    const prompt = buildRandomEventClaimPrompt({
      title: getRandomEventEmbedTitle(context.selection.scenario, context.selection.renderedTitle),
      description: buildActiveClaimDescription(
        context.selection.renderedPrompt,
        activityLine,
        getActiveRandomEventCurrentPhaseExpiryMs(context),
        participants,
        context.failedAttemptLines,
        context.selection.scenario.requiredReadyCount ?? null,
        context.selection.scenario.rollChallenge ?? null,
      ),
      buttonCustomId: buildRandomEventClaimButtonId(eventId),
      buttonLabel: buildActiveClaimButtonLabel({
        claimLabel: context.selection.renderedClaimLabel,
        participantCount: participants.length,
        requiredReadyCount: context.selection.scenario.requiredReadyCount ?? null,
        hasKeepOpenFailures: context.failedAttemptLines.length > 0,
        retryMode:
          getRandomEventRetryPolicy(context.selection.scenario) === "allow-retry"
            ? "same-user-can-retry"
            : "next-user-must-try",
        challenge: context.selection.scenario.rollChallenge ?? null,
      }),
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
      buttonLabel: buildSequenceChallengeButtonLabel(challenge, session.progress),
      color: rarityPresentation.color,
      footerText: `${rarityPresentation.label} • Challenge`,
    });

    await context.message.edit(prompt).catch((error) => {
      logger.warn("[random-events] Failed to refresh staged challenge prompt.", error);
    });
  };

  const recordAttemptAchievements = (
    context: ActiveRandomEventContext | undefined,
    {
      userId,
      attemptResolution,
      hadKeepOpenFailureBeforeSuccess,
    }: {
      userId: string;
      attemptResolution: RandomEventAttemptResolution;
      hadKeepOpenFailureBeforeSuccess: boolean;
    },
  ): AchievementAnnouncement[] => {
    if (!context) {
      return [];
    }

    const randomEventAchievementResult = recordRandomEventAchievementStats(db, {
      selection: context.selection,
      userId,
      attemptResolution,
      hadKeepOpenFailureBeforeSuccess,
      nowMs: Date.now(),
    });
    const newlyEarned = awardManualDiceAchievements(
      progression,
      userId,
      getRandomEventAchievementIds(randomEventAchievementResult.stats, {
        cursedEvening: randomEventAchievementResult.cursedEvening,
      }),
    );
    const announcement = createAchievementAnnouncement(userId, newlyEarned);
    return announcement ? [announcement] : [];
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
    clearPhaseTimer(context);
    if (context) {
      context.sequenceChallenge = null;
    }

    const achievementAnnouncements = await resolveRandomEvent({
      activeEventsById,
      state,
      economy,
      inventory,
      itemCatalog,
      progression,
      hostileEffects,
      pvp,
      eventId,
      participants,
      challengeProgressByUserId,
      resolutionNotesByUserId,
      attemptResolutionsByUserId,
      onAttemptResolved: (input) => recordAttemptAchievements(context, input),
    });
    await publishAchievementAnnouncements({
      client,
      announcements: achievementAnnouncements,
      logger,
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
      economy,
      inventory,
      itemCatalog,
      progression,
      hostileEffects,
      pvp,
      selection: context.selection,
      userId,
      challengeProgress,
      resolutionNote,
    });

    if (attemptResolution.resolution === "keep-open-failure") {
      const achievementAnnouncements = recordAttemptAchievements(context, {
        userId,
        attemptResolution,
        hadKeepOpenFailureBeforeSuccess: false,
      });
      context.attemptedUserIds.add(userId);
      context.failedAttemptUserIds.add(userId);
      context.failedAttemptLines.push(attemptResolution.failedAttemptLine);
      clearSequenceChallengeTimer(context);
      context.sequenceChallenge = null;

      const reopened = await reopenFirstClickEvent(eventId);
      if (!reopened) {
        await resolveEvent({
          eventId,
          participants: [],
        });
        await publishAchievementAnnouncements({
          client,
          announcements: achievementAnnouncements,
          logger,
        });
        return;
      }
      await publishAchievementAnnouncements({
        client,
        announcements: achievementAnnouncements,
        logger,
      });
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

  const applyEffectsToUser = ({
    userId,
    scenarioId,
    effectSourceId,
    effects,
    resolvedCurrencyAmounts,
  }: {
    userId: string;
    scenarioId: string;
    effectSourceId: string;
    effects: RandomEventEffect[];
    resolvedCurrencyAmounts?: number[];
  }) => {
    return applyRandomEventEffectsToUser(
      {
        economy,
        inventory,
        itemCatalog,
        progression,
        hostileEffects,
        nowMs: Date.now(),
        random: Math.random,
        resolvedCurrencyAmounts,
      },
      userId,
      scenarioId,
      effectSourceId,
      effects,
    );
  };

  const resolveStageChallenge = ({
    userId,
    challenge,
  }: {
    userId: string;
    challenge: RandomEventRollChallengeDefinition;
  }): RandomEventRollChallengeProgress => {
    return resolveRollChallengeImmediately(progression, userId, challenge);
  };

  const buildStageAttemptLine = ({
    userId,
    message,
    progress,
    effectNotes,
  }: {
    userId: string;
    message: string;
    progress: RandomEventRollChallengeProgress;
    effectNotes: string[];
  }): string => {
    const rollSummary = formatChallengeProgressSummary(progress);
    const notes = effectNotes.length > 0 ? ` ${effectNotes.join(" ")}` : "";
    return `<@${userId}>: ${rollSummary ? `${rollSummary}. ` : ""}${message}${notes}`;
  };

  const cashOutPushYourLuck = async ({
    eventId,
    userId,
    reasonLine,
  }: {
    eventId: string;
    userId: string;
    reasonLine: string;
  }): Promise<void> => {
    const context = activeEventsById.get(eventId);
    const flow = context ? getRandomEventFlow(context.selection.scenario) : null;
    if (
      !context ||
      !flow ||
      flow.type !== "solo-push-your-luck" ||
      context.flowState.type !== "solo-push-your-luck"
    ) {
      return;
    }

    const payout = applyEffectsToUser({
      userId,
      scenarioId: context.selection.scenario.id,
      effectSourceId: `cashout-${context.flowState.stageIndex}`,
      effects: context.flowState.potEffects,
    });
    const payoutLine = `<@${userId}>: ${reasonLine} ${payout.effectNotes.join(" ")}`.trim();
    await resolveCustomEvent(eventId, [...context.flowState.resolvedLines, payoutLine]);
  };

  const completeGroupMeterStage = async ({
    eventId,
    userId,
  }: {
    eventId: string;
    userId: string;
  }): Promise<void> => {
    const context = activeEventsById.get(eventId);
    const flow = context ? getRandomEventFlow(context.selection.scenario) : null;
    if (
      !context ||
      !flow ||
      flow.type !== "group-meter" ||
      context.flowState.type !== "group-meter"
    ) {
      return;
    }

    const participantIds = [...context.flowState.participantUserIds];
    const rewardPolicy = flow.participantRewardPolicy ?? "finisher-bonus";
    const lines = [...context.flowState.resolvedLines];
    while (context.flowState.stageIndex < flow.stages.length) {
      const stage = flow.stages[context.flowState.stageIndex];
      if (!stage || participantIds.length < (stage.requiredSuccesses ?? Number.MAX_SAFE_INTEGER)) {
        break;
      }

      const baseCurrencyAmounts = resolveRandomEventCurrencyEffectAmounts(
        stage.successEffects,
        Math.random,
      );
      const totalCurrency = baseCurrencyAmounts.reduce((sum, amount) => sum + amount, 0);

      for (const participantId of participantIds) {
        const result = applyEffectsToUser({
          userId: participantId,
          scenarioId: context.selection.scenario.id,
          effectSourceId: `${stage.id}-reward`,
          effects: stage.successEffects,
          resolvedCurrencyAmounts: baseCurrencyAmounts,
        });
        lines.push(
          `<@${participantId}>: ${stage.successMessage} ${result.effectNotes.join(" ")}`.trim(),
        );
      }

      if (
        rewardPolicy === "finisher-bonus" &&
        context.flowState.stageIndex === flow.stages.length - 1 &&
        totalCurrency > 0
      ) {
        const bonus = Math.max(1, Math.floor(totalCurrency * 0.2));
        const result = applyEffectsToUser({
          userId,
          scenarioId: context.selection.scenario.id,
          effectSourceId: `${stage.id}-finisher-bonus`,
          effects: [
            {
              type: "currency",
              minAmount: bonus,
              maxAmount: bonus,
            },
          ],
        });
        lines.push(
          `<@${userId}>: Finisher bonus for **${stage.label}**. ${result.effectNotes.join(" ")}`.trim(),
        );
      }

      context.flowState.stageIndex += 1;
      context.flowState.currentStageContributorUserIds = new Set<string>();
      context.flowState.currentStageAttemptedUserIds = new Set<string>();
      context.failedAttemptLines = [];
    }

    context.flowState.resolvedLines = lines;
    context.flowState.stageProgress = context.flowState.participantUserIds.size;

    if (context.flowState.stageIndex >= flow.stages.length) {
      await resolveCustomEvent(eventId, context.flowState.resolvedLines);
      return;
    }

    resetPhaseExpiry(eventId);
    await refreshNonWindowPrompt(eventId);
  };

  const handleNonWindowPhaseExpiry = async (eventId: string): Promise<void> => {
    const context = activeEventsById.get(eventId);
    if (!context) {
      return;
    }

    const flow = getRandomEventFlow(context.selection.scenario);
    if (flow.type === "single-resolution") {
      return;
    }

    if (flow.type === "solo-ladder" && context.flowState.type === "solo-ladder") {
      const stage = flow.stages[context.flowState.stageIndex];
      if (!context.flowState.ownerUserId || !stage) {
        await expireCustomEvent(eventId, context.failedAttemptLines);
        return;
      }

      const progress = resolveStageChallenge({
        userId: context.flowState.ownerUserId,
        challenge: stage.rollChallenge!,
      });
      const effects = progress.succeeded ? stage.successEffects : (stage.failureEffects ?? []);
      const result = applyEffectsToUser({
        userId: context.flowState.ownerUserId,
        scenarioId: context.selection.scenario.id,
        effectSourceId: stage.id,
        effects,
      });
      const line = buildStageAttemptLine({
        userId: context.flowState.ownerUserId,
        message:
          progress.succeeded === true
            ? `${stage.successMessage} ⏱️ The stage resolved when time ran out.`
            : `${stage.failureMessage ?? "The run ends here."} ⏱️ The stage resolved when time ran out.`,
        progress,
        effectNotes: result.effectNotes,
      });

      if (progress.succeeded === true) {
        context.flowState.resolvedLines.push(line);
        context.flowState.stageIndex += 1;
        if (context.flowState.stageIndex >= flow.stages.length) {
          await resolveCustomEvent(eventId, context.flowState.resolvedLines);
          return;
        }

        resetPhaseExpiry(eventId);
        await refreshNonWindowPrompt(eventId);
        return;
      }

      await resolveCustomEvent(eventId, [...context.flowState.resolvedLines, line]);
      return;
    }

    if (flow.type === "solo-push-your-luck" && context.flowState.type === "solo-push-your-luck") {
      if (!context.flowState.ownerUserId) {
        await expireCustomEvent(eventId, context.failedAttemptLines);
        return;
      }

      await cashOutPushYourLuck({
        eventId,
        userId: context.flowState.ownerUserId,
        reasonLine: "⏱️ Time ran out, so the pot was cashed out automatically.",
      });
      return;
    }

    if (flow.type === "group-meter" && context.flowState.type === "group-meter") {
      const stage = flow.stages[context.flowState.stageIndex];
      const threshold = stage?.requiredSuccesses ?? context.flowState.stageProgress;
      const timeoutLine =
        context.flowState.stageProgress > 0
          ? `The group stalled at ${context.flowState.stageProgress}/${threshold} successes before time ran out.`
          : "No one held the line together before time ran out.";
      await resolveCustomEvent(eventId, [
        ...context.flowState.resolvedLines,
        ...context.failedAttemptLines,
        timeoutLine,
      ]);
      return;
    }

    if (flow.type === "stake-offer") {
      await expireCustomEvent(eventId, context.failedAttemptLines);
    }
  };

  const handleSoloLadderAction = async (
    eventId: string,
    userId: string,
    action: "claim" | "continue",
  ): Promise<"handled" | "not-owner" | "invalid"> => {
    const context = activeEventsById.get(eventId);
    const flow = context ? getRandomEventFlow(context.selection.scenario) : null;
    if (
      !context ||
      !flow ||
      flow.type !== "solo-ladder" ||
      context.flowState.type !== "solo-ladder"
    ) {
      return "invalid";
    }

    const stage = flow.stages[context.flowState.stageIndex];
    if (!stage) {
      return "invalid";
    }

    if (action === "claim" && context.flowState.ownerUserId === null) {
      context.flowState.ownerUserId = userId;
    } else if (context.flowState.ownerUserId !== userId) {
      return "not-owner";
    }

    const progress = resolveStageChallenge({ userId, challenge: stage.rollChallenge! });
    const effects = progress.succeeded ? stage.successEffects : (stage.failureEffects ?? []);
    const result = applyEffectsToUser({
      userId,
      scenarioId: context.selection.scenario.id,
      effectSourceId: stage.id,
      effects,
    });
    const line = buildStageAttemptLine({
      userId,
      message: progress.succeeded
        ? stage.successMessage
        : (stage.failureMessage ?? "The run ends here."),
      progress,
      effectNotes: result.effectNotes,
    });

    if (progress.succeeded) {
      context.flowState.resolvedLines.push(line);
      context.flowState.stageIndex += 1;
      context.failedAttemptLines = [];
      if (context.flowState.stageIndex >= flow.stages.length) {
        await resolveCustomEvent(eventId, context.flowState.resolvedLines);
        return "handled";
      }

      resetPhaseExpiry(eventId);
      await refreshNonWindowPrompt(eventId);
      return "handled";
    }

    await resolveCustomEvent(eventId, [...context.flowState.resolvedLines, line]);
    return "handled";
  };

  const handlePushYourLuckAction = async (
    eventId: string,
    userId: string,
    action: "claim" | "continue" | "cash-out",
  ): Promise<"handled" | "not-owner" | "invalid"> => {
    const context = activeEventsById.get(eventId);
    const flow = context ? getRandomEventFlow(context.selection.scenario) : null;
    if (
      !context ||
      !flow ||
      flow.type !== "solo-push-your-luck" ||
      context.flowState.type !== "solo-push-your-luck"
    ) {
      return "invalid";
    }

    if (action === "cash-out") {
      if (!context.flowState.ownerUserId || context.flowState.ownerUserId !== userId) {
        return "not-owner";
      }

      await cashOutPushYourLuck({
        eventId,
        userId,
        reasonLine: "Cashed out the pot.",
      });
      return "handled";
    }

    const stage = flow.stages[context.flowState.stageIndex];
    if (!stage) {
      return "invalid";
    }

    if (action === "claim" && context.flowState.ownerUserId === null) {
      context.flowState.ownerUserId = userId;
    } else if (context.flowState.ownerUserId !== userId) {
      return "not-owner";
    }

    const progress = resolveStageChallenge({ userId, challenge: stage.rollChallenge! });
    if (!progress.succeeded) {
      const result = applyEffectsToUser({
        userId,
        scenarioId: context.selection.scenario.id,
        effectSourceId: stage.id,
        effects: stage.failureEffects ?? [],
      });
      const line = buildStageAttemptLine({
        userId,
        message: stage.failureMessage ?? "The run ends here.",
        progress,
        effectNotes: result.effectNotes,
      });
      await resolveCustomEvent(eventId, [...context.flowState.resolvedLines, line]);
      return "handled";
    }

    const resolvedCurrencyAmounts = resolveRandomEventCurrencyEffectAmounts(
      stage.successEffects,
      Math.random,
    );
    context.flowState.potEffects.push(
      ...resolvedCurrencyAmounts.map((amount) => ({
        type: "currency" as const,
        minAmount: amount,
        maxAmount: amount,
      })),
    );
    context.flowState.resolvedLines.push(
      buildStageAttemptLine({
        userId,
        message: stage.successMessage,
        progress,
        effectNotes: [
          `Pot grew by ${resolvedCurrencyAmounts.reduce((sum, amount) => sum + amount, 0)} pips.`,
        ],
      }),
    );
    context.flowState.stageIndex += 1;
    resetPhaseExpiry(eventId);

    if (context.flowState.stageIndex >= flow.stages.length) {
      await cashOutPushYourLuck({
        eventId,
        userId,
        reasonLine: "Cleared the whole route and cashed out the full pot.",
      });
      return "handled";
    }

    await refreshNonWindowPrompt(eventId);
    return "handled";
  };

  const handleGroupMeterJoin = async (
    eventId: string,
    userId: string,
  ): Promise<"handled" | "already-contributed" | "invalid"> => {
    const context = activeEventsById.get(eventId);
    const flow = context ? getRandomEventFlow(context.selection.scenario) : null;
    if (
      !context ||
      !flow ||
      flow.type !== "group-meter" ||
      context.flowState.type !== "group-meter"
    ) {
      return "invalid";
    }

    const stage = flow.stages[context.flowState.stageIndex];
    if (!stage) {
      return "invalid";
    }

    if (
      context.flowState.participantUserIds.has(userId) ||
      context.flowState.currentStageAttemptedUserIds.has(userId)
    ) {
      return "already-contributed";
    }

    context.flowState.currentStageAttemptedUserIds.add(userId);

    if (stage.rollChallenge) {
      const progress = resolveStageChallenge({ userId, challenge: stage.rollChallenge });
      if (!progress.succeeded) {
        const result = applyEffectsToUser({
          userId,
          scenarioId: context.selection.scenario.id,
          effectSourceId: stage.id,
          effects: stage.failureEffects ?? [],
        });
        const line = buildStageAttemptLine({
          userId,
          message: stage.failureMessage ?? "The attempt falls apart.",
          progress,
          effectNotes: result.effectNotes,
        });

        if (stage.failureResolution === "resolve-event") {
          await resolveCustomEvent(eventId, [...context.flowState.resolvedLines, line]);
          return "handled";
        }

        context.failedAttemptLines.push(line);
        resetPhaseExpiry(eventId);
        await refreshNonWindowPrompt(eventId);
        return "handled";
      }
    }

    context.flowState.participantUserIds.add(userId);
    context.flowState.currentStageContributorUserIds.add(userId);
    context.flowState.stageProgress = context.flowState.participantUserIds.size;
    if (context.flowState.stageProgress >= (stage.requiredSuccesses ?? 1)) {
      await completeGroupMeterStage({ eventId, userId });
      return "handled";
    }

    resetPhaseExpiry(eventId);
    await refreshNonWindowPrompt(eventId);
    return "handled";
  };

  const handleStakeOfferAction = async (
    eventId: string,
    userId: string,
    action: "claim" | "continue" | "cash-out",
  ): Promise<"handled" | "not-owner" | "invalid" | "insufficient-pips"> => {
    const context = activeEventsById.get(eventId);
    const flow = context ? getRandomEventFlow(context.selection.scenario) : null;
    if (
      !context ||
      !flow ||
      flow.type !== "stake-offer" ||
      context.flowState.type !== "stake-offer"
    ) {
      return "invalid";
    }

    if (action === "claim") {
      if (context.flowState.ownerUserId && context.flowState.ownerUserId !== userId) {
        return "not-owner";
      }

      context.flowState.ownerUserId = userId;
      resetPhaseExpiry(eventId);
      await refreshNonWindowPrompt(eventId);
      return "handled";
    }

    if (!context.flowState.ownerUserId || context.flowState.ownerUserId !== userId) {
      return "not-owner";
    }

    if (action === "cash-out") {
      await resolveCustomEvent(eventId, [`<@${userId}>: ${flow.declineMessage}`]);
      return "handled";
    }

    if (economy.getPips(userId) < flow.stakePips) {
      return "insufficient-pips";
    }

    economy.applyPipsDelta({ userId, amount: -flow.stakePips });
    const attemptResolution = resolveRandomEventAttempt({
      economy,
      inventory,
      itemCatalog,
      progression,
      hostileEffects,
      pvp,
      selection: context.selection,
      userId,
      resolutionNote: `Paid ${flow.stakePips} pips to play.`,
    });
    await resolveCustomEvent(eventId, [attemptResolution.finalLine]);
    return "handled";
  };

  const onTriggerOpportunity = async (context: {
    now: Date;
    requiredClaimPolicy?: RandomEventClaimPolicy;
  }): Promise<TriggerOpportunityResult> => {
    const result = await triggerRandomEventOpportunity({
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

    if (result?.created && result.eventId) {
      const activeContext = activeEventsById.get(result.eventId);
      if (activeContext && activeContext.flowState.type !== "single-resolution") {
        schedulePhaseExpiry(result.eventId, activeContext.baseDurationMs);
        await refreshNonWindowPrompt(result.eventId);
      }
    }

    return result;
  };

  const handleButtonInteraction = async (interaction: ButtonInteraction): Promise<void> => {
    const parsedAction = parseRandomEventActionButtonId(interaction.customId);
    if (!parsedAction) {
      await interaction.deferUpdate();
      return;
    }

    const { windowId: eventId, action } = parsedAction;

    if (isWithinClickCooldown(interaction.user.id)) {
      await interaction.reply({
        content: "Slow down a bit. Wait 2 seconds before clicking again.",
        ephemeral: true,
      });
      return;
    }

    const activeContext = activeEventsById.get(eventId);
    if (activeContext && activeContext.flowState.type !== "single-resolution") {
      startClickCooldown(interaction.user.id);
      await interaction.deferUpdate();

      if (Date.now() >= getActiveRandomEventCurrentPhaseExpiryMs(activeContext)) {
        await handleNonWindowPhaseExpiry(eventId);
        return;
      }

      const flow = getRandomEventFlow(activeContext.selection.scenario);
      if (flow.type === "solo-ladder" && (action === "claim" || action === "continue")) {
        const result = await handleSoloLadderAction(eventId, interaction.user.id, action);
        if (result === "not-owner") {
          await interaction.followUp({
            content: "Too late — someone else owns this run now.",
            ephemeral: true,
          });
        }
        return;
      }

      if (
        flow.type === "solo-push-your-luck" &&
        (action === "claim" || action === "continue" || action === "cash-out")
      ) {
        const result = await handlePushYourLuckAction(eventId, interaction.user.id, action);
        if (result === "not-owner") {
          await interaction.followUp({
            content: "Too late — someone else is holding this pot.",
            ephemeral: true,
          });
        }
        return;
      }

      if (flow.type === "group-meter" && action === "join") {
        const result = await handleGroupMeterJoin(eventId, interaction.user.id);
        if (result === "already-contributed") {
          await interaction.followUp({
            content: "You already contributed to this stage.",
            ephemeral: true,
          });
        }
        return;
      }

      if (
        flow.type === "stake-offer" &&
        (action === "claim" || action === "continue" || action === "cash-out")
      ) {
        const result = await handleStakeOfferAction(eventId, interaction.user.id, action);
        if (result === "not-owner") {
          await interaction.followUp({
            content: "Too late — someone else is already holding the offer.",
            ephemeral: true,
          });
        }
        if (result === "insufficient-pips") {
          await interaction.followUp({
            content: "You do not have enough pips to take this deal.",
            ephemeral: true,
          });
        }
        return;
      }

      await interaction.followUp({
        content: "That action is no longer available.",
        ephemeral: true,
      });
      return;
    }

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

      startClickCooldown(interaction.user.id);
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

    if (action !== "claim") {
      await interaction.reply({
        content: "That action is no longer available.",
        ephemeral: true,
      });
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
      startClickCooldown(interaction.user.id);
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
        const windowSnapshot =
          sequenceContext || context.flowState.type !== "single-resolution"
            ? null
            : windowManager.getWindow(context.eventId);
        return {
          eventId: context.eventId,
          title: context.selection.renderedTitle,
          rarity: context.selection.scenario.rarity,
          claimPolicy: context.selection.scenario.claimPolicy,
          participantCount: sequenceContext
            ? 1
            : context.flowState.type === "group-meter"
              ? context.flowState.participantUserIds.size
              : context.flowState.type === "solo-ladder" ||
                  context.flowState.type === "solo-push-your-luck" ||
                  context.flowState.type === "stake-offer"
                ? Number(context.flowState.ownerUserId !== null)
                : (windowSnapshot?.participants.length ?? 0),
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
      clearPhaseTimer(context);
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
