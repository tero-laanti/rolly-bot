import type { DiceProgressionRepository } from "../../progression/application/ports";
import type { DiceHostileEffectsService } from "../../progression/application/hostile-effects-service";
import type { DicePvpRepository } from "../../pvp/application/ports";
import {
  hasRandomEventChallengeOutcomeBranching,
  renderRandomEventOutcome,
  selectRandomEventOutcomeForScenario,
  type RandomEventOutcome,
  type RandomEventOutcomeResolution,
  type RandomEventRenderedOutcome,
  type RandomEventScenarioRender,
} from "../domain/content";
import {
  resolveRollChallengeImmediately,
  type RandomEventRollChallengeProgress,
} from "../domain/roll-challenges";
import { minutesToMs } from "../../../shared/time";
import { buildExpiredEventEmbed, buildResolvedEventEmbed } from "./live-runtime-presentation";
import type { ActiveRandomEventContext } from "./live-runtime-types";
import { resolveActiveRandomEvent, type RandomEventsState } from "./state-store";

export type RandomEventAppliedNegativeEffect =
  | {
      type: "temporary-lockout";
      expiresAtMs: number | null;
    }
  | {
      type: "temporary-roll-penalty";
    };

export type RandomEventAttemptResolution = {
  userId: string;
  outcome: RandomEventOutcome;
  renderedOutcomeMessage: string;
  challengeRollSummary: string | null;
  effectNotes: string[];
  appliedNegativeEffects: RandomEventAppliedNegativeEffect[];
  hadActiveNegativeEffectBeforeAttempt: boolean;
  resolutionNote: string | null;
  resolution: RandomEventOutcomeResolution;
  finalLine: string;
  failedAttemptLine: string;
};

type SharedRandomEventOutcomeSelection = Pick<
  RandomEventRenderedOutcome,
  "selectedOutcome" | "renderedOutcomeMessage"
>;

type RandomEventResolutionProgression = Pick<
  DiceProgressionRepository,
  "getDiceSides" | "getDiceBans" | "applyDiceTemporaryEffect"
> &
  Partial<Pick<DiceProgressionRepository, "getActiveDiceTemporaryEffects">>;

const applyOutcomeEffectsToUser = (
  {
    progression,
    hostileEffects,
    nowMs,
  }: {
    progression: RandomEventResolutionProgression;
    hostileEffects: Pick<
      DiceHostileEffectsService,
      "applyShieldableNegativeLockout" | "applyShieldableNegativeRollPenalty"
    >;
    nowMs: number;
  },
  userId: string,
  scenarioId: string,
  outcome: RandomEventOutcome,
): {
  effectNotes: string[];
  appliedNegativeEffects: RandomEventAppliedNegativeEffect[];
} => {
  const effectNotes: string[] = [];
  const appliedNegativeEffects: RandomEventAppliedNegativeEffect[] = [];

  for (const effect of outcome.effects) {
    if (effect.type === "currency") {
      continue;
    }

    if (effect.type === "temporary-roll-multiplier") {
      progression.applyDiceTemporaryEffect({
        userId,
        effectCode: "roll-pass-multiplier",
        kind: "positive",
        source: `random-event:${scenarioId}:${outcome.id}`,
        magnitude: effect.multiplier,
        remainingRolls: effect.rolls,
        consumeOnCommand: "dice",
        stackGroup: "roll-pass-multiplier",
        stackMode: effect.stackMode,
      });
      continue;
    }

    if (effect.type === "temporary-roll-penalty") {
      const result = hostileEffects.applyShieldableNegativeRollPenalty({
        userId,
        source: `random-event:${scenarioId}:${outcome.id}`,
        divisor: effect.divisor,
        rolls: effect.rolls,
        stackMode: effect.stackMode,
      });
      if (result.blockedByShield) {
        effectNotes.push("Bad Luck Umbrella blocked a negative event effect.");
      } else {
        appliedNegativeEffects.push({
          type: "temporary-roll-penalty",
        });
      }
      continue;
    }

    const result = hostileEffects.applyShieldableNegativeLockout({
      userId,
      durationMs: minutesToMs(effect.durationMinutes),
      nowMs,
    });
    if (result.blockedByShield) {
      effectNotes.push("Bad Luck Umbrella blocked a negative event effect.");
    } else {
      appliedNegativeEffects.push({
        type: "temporary-lockout",
        expiresAtMs: result.lockoutUntilMs,
      });
    }
  }

  return {
    effectNotes,
    appliedNegativeEffects,
  };
};

const formatChallengeRollSummary = (
  challengeProgress: RandomEventRollChallengeProgress | null,
  prefix = false,
): string | null => {
  if (!challengeProgress || challengeProgress.stepResults.length < 1) {
    return null;
  }

  const rollSummary = challengeProgress.stepResults
    .map((stepResult) => `${stepResult.rolledValue} (d${stepResult.dieSides})`)
    .join(" → ");

  return prefix ? `🎲 You rolled: ${rollSummary}` : `Rolled ${rollSummary}`;
};

const formatFinalOutcomeLine = (resolution: RandomEventAttemptResolution): string => {
  const noteParts = [...resolution.effectNotes];
  if (resolution.resolutionNote) {
    noteParts.push(resolution.resolutionNote);
  }

  const noteText = noteParts.length > 0 ? ` ${noteParts.join(" ")}` : "";
  const prefix = resolution.resolution === "resolve-success" ? "Success:" : "Fail:";
  if (resolution.challengeRollSummary) {
    return `<@${resolution.userId}>: ${resolution.challengeRollSummary}. ${prefix} ${resolution.renderedOutcomeMessage}${noteText}`;
  }

  return `<@${resolution.userId}>: ${prefix} ${resolution.renderedOutcomeMessage}${noteText}`;
};

const formatFailedAttemptLine = (resolution: RandomEventAttemptResolution): string => {
  const noteParts = [...resolution.effectNotes];
  if (resolution.resolutionNote) {
    noteParts.push(resolution.resolutionNote);
  }

  const noteText = noteParts.length > 0 ? ` ${noteParts.join(" ")}` : "";
  const challengeText = resolution.challengeRollSummary
    ? `${resolution.challengeRollSummary}. `
    : "";
  return `<@${resolution.userId}> failed: ${challengeText}${resolution.renderedOutcomeMessage}${noteText}`;
};

export const resolveRandomEventAttempt = ({
  progression,
  hostileEffects,
  pvp,
  selection,
  userId,
  challengeProgress,
  resolutionNote,
  sharedOutcomeSelection,
}: {
  progression: RandomEventResolutionProgression;
  hostileEffects: Pick<
    DiceHostileEffectsService,
    "applyShieldableNegativeLockout" | "applyShieldableNegativeRollPenalty"
  >;
  pvp?: Pick<DicePvpRepository, "getActiveDiceLockout">;
  selection: RandomEventScenarioRender;
  userId: string;
  challengeProgress?: RandomEventRollChallengeProgress | null;
  resolutionNote?: string | null;
  sharedOutcomeSelection?: SharedRandomEventOutcomeSelection | null;
}): RandomEventAttemptResolution => {
  const scenario = selection.scenario;
  let resolvedChallengeProgress = challengeProgress ?? null;

  if (scenario.rollChallenge && !resolvedChallengeProgress) {
    resolvedChallengeProgress = resolveRollChallengeImmediately(
      progression,
      userId,
      scenario.rollChallenge,
    );
  }

  const challengeResult =
    scenario.rollChallenge && resolvedChallengeProgress
      ? resolvedChallengeProgress.succeeded
        ? "success"
        : "failure"
      : undefined;

  const renderedOutcome =
    sharedOutcomeSelection ??
    (() => {
      const outcome = selectRandomEventOutcomeForScenario(scenario, {
        challengeResult,
      });
      if (!outcome) {
        throw new Error(`Scenario ${scenario.id} did not produce an outcome.`);
      }

      const resolvedOutcome = renderRandomEventOutcome(selection, outcome);
      return {
        selectedOutcome: resolvedOutcome.selectedOutcome,
        renderedOutcomeMessage: resolvedOutcome.renderedOutcomeMessage,
      };
    })();
  const nowMs = Date.now();
  const hadActiveNegativeEffectBeforeAttempt =
    progression
      .getActiveDiceTemporaryEffects?.({
        userId,
        nowMs,
      })
      ?.some((effect) => effect.kind === "negative") === true ||
    (pvp?.getActiveDiceLockout(userId, nowMs) ?? null) !== null;
  const { effectNotes, appliedNegativeEffects } = applyOutcomeEffectsToUser(
    { progression, hostileEffects, nowMs },
    userId,
    scenario.id,
    renderedOutcome.selectedOutcome,
  );
  const attemptResolution: RandomEventAttemptResolution = {
    userId,
    outcome: renderedOutcome.selectedOutcome,
    renderedOutcomeMessage: renderedOutcome.renderedOutcomeMessage,
    challengeRollSummary: formatChallengeRollSummary(
      resolvedChallengeProgress,
      renderedOutcome.selectedOutcome.resolution !== "keep-open-failure",
    ),
    effectNotes,
    appliedNegativeEffects,
    hadActiveNegativeEffectBeforeAttempt,
    resolutionNote: resolutionNote ?? null,
    resolution: renderedOutcome.selectedOutcome.resolution,
    finalLine: "",
    failedAttemptLine: "",
  };

  attemptResolution.finalLine = formatFinalOutcomeLine(attemptResolution);
  attemptResolution.failedAttemptLine = formatFailedAttemptLine({
    ...attemptResolution,
    challengeRollSummary: formatChallengeRollSummary(resolvedChallengeProgress, false),
  });

  return attemptResolution;
};

export const resolveRandomEvent = async ({
  activeEventsById,
  state,
  progression,
  hostileEffects,
  pvp,
  eventId,
  participants,
  challengeProgressByUserId,
  resolutionNotesByUserId,
  attemptResolutionsByUserId,
  onAttemptResolved,
}: {
  activeEventsById: Map<string, ActiveRandomEventContext>;
  state: RandomEventsState;
  progression: RandomEventResolutionProgression;
  hostileEffects: Pick<
    DiceHostileEffectsService,
    "applyShieldableNegativeLockout" | "applyShieldableNegativeRollPenalty"
  >;
  pvp?: Pick<DicePvpRepository, "getActiveDiceLockout">;
  eventId: string;
  participants: string[];
  challengeProgressByUserId?: ReadonlyMap<string, RandomEventRollChallengeProgress>;
  resolutionNotesByUserId?: ReadonlyMap<string, string>;
  attemptResolutionsByUserId?: ReadonlyMap<string, RandomEventAttemptResolution>;
  onAttemptResolved?: (input: {
    userId: string;
    attemptResolution: RandomEventAttemptResolution;
    hadKeepOpenFailureBeforeSuccess: boolean;
  }) => string | null | undefined;
}): Promise<void> => {
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
      embeds: [
        buildExpiredEventEmbed(
          context.selection,
          context.failedAttemptLines,
          participants,
        ).toJSON(),
      ],
      components: [],
    });
    return;
  }

  if (
    typeof context.selection.scenario.requiredReadyCount === "number" &&
    participants.length < context.selection.scenario.requiredReadyCount
  ) {
    await context.message.edit({
      content: "",
      embeds: [
        buildExpiredEventEmbed(
          context.selection,
          context.failedAttemptLines,
          participants,
        ).toJSON(),
      ],
      components: [],
    });
    return;
  }

  const scenario = context.selection.scenario;
  const participantsToResolve =
    scenario.claimPolicy === "first-click" ? [participants[0] as string] : participants;
  const sharedOutcomeSelection =
    participantsToResolve.length > 1 &&
    scenario.claimPolicy === "multi-user" &&
    !hasRandomEventChallengeOutcomeBranching(scenario)
      ? (() => {
          const outcome = selectRandomEventOutcomeForScenario(scenario);
          if (!outcome) {
            throw new Error(`Scenario ${scenario.id} did not produce an outcome.`);
          }

          const renderedOutcome = renderRandomEventOutcome(context.selection, outcome);
          return {
            selectedOutcome: renderedOutcome.selectedOutcome,
            renderedOutcomeMessage: renderedOutcome.renderedOutcomeMessage,
          };
        })()
      : null;

  const lines = participantsToResolve.map((userId) => {
    const attemptResolution =
      attemptResolutionsByUserId?.get(userId) ??
      resolveRandomEventAttempt({
        progression,
        hostileEffects,
        pvp,
        selection: context.selection,
        userId,
        challengeProgress: challengeProgressByUserId?.get(userId) ?? null,
        resolutionNote: resolutionNotesByUserId?.get(userId) ?? null,
        sharedOutcomeSelection,
      });
    const achievementText = onAttemptResolved?.({
      userId,
      attemptResolution,
      hadKeepOpenFailureBeforeSuccess:
        attemptResolution.resolution === "resolve-success" && context.failedAttemptLines.length > 0,
    });
    return achievementText
      ? `${attemptResolution.finalLine} ${achievementText}`
      : attemptResolution.finalLine;
  });

  await context.message.edit({
    content: "",
    embeds: [buildResolvedEventEmbed(context.selection, lines).toJSON()],
    components: [],
  });
};
