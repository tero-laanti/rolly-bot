import type { DiceProgressionRepository } from "../../progression/application/ports";
import type { DiceHostileEffectsService } from "../../progression/application/hostile-effects-service";
import {
  renderRandomEventScenario,
  selectRandomEventOutcomeForScenario,
  type RandomEventOutcome,
  type RandomEventScenario,
} from "../domain/content";
import {
  resolveRollChallengeImmediately,
  type RandomEventRollChallengeProgress,
} from "../domain/roll-challenges";
import { buildExpiredEventEmbed, buildResolvedEventEmbed } from "./live-runtime-presentation";
import type { ActiveRandomEventContext } from "./live-runtime-types";
import { resolveActiveRandomEvent, type RandomEventsState } from "./state-store";

type RandomEventUserResolution = {
  userId: string;
  renderedOutcomeMessage: string;
  challengeRollSummary: string | null;
  effectNotes: string[];
};

const applyOutcomeEffectsToUser = (
  {
    progression,
    hostileEffects,
  }: {
    progression: Pick<
      DiceProgressionRepository,
      "getDiceSides" | "getDiceBans" | "applyDiceTemporaryEffect"
    >;
    hostileEffects: Pick<
      DiceHostileEffectsService,
      "applyShieldableNegativeLockout" | "applyShieldableNegativeRollPenalty"
    >;
  },
  userId: string,
  scenario: RandomEventScenario,
  outcome: RandomEventOutcome,
): string[] => {
  const effectNotes: string[] = [];

  for (const effect of outcome.effects) {
    if (effect.type === "currency") {
      continue;
    }

    if (effect.type === "temporary-roll-multiplier") {
      progression.applyDiceTemporaryEffect({
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
      const result = hostileEffects.applyShieldableNegativeRollPenalty({
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

    const result = hostileEffects.applyShieldableNegativeLockout({
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

export const resolveRandomEvent = async ({
  activeEventsById,
  state,
  progression,
  hostileEffects,
  eventId,
  participants,
}: {
  activeEventsById: Map<string, ActiveRandomEventContext>;
  state: RandomEventsState;
  progression: Pick<
    DiceProgressionRepository,
    "getDiceSides" | "getDiceBans" | "applyDiceTemporaryEffect"
  >;
  hostileEffects: Pick<
    DiceHostileEffectsService,
    "applyShieldableNegativeLockout" | "applyShieldableNegativeRollPenalty"
  >;
  eventId: string;
  participants: string[];
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
        progression,
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
    const effectNotes = applyOutcomeEffectsToUser(
      { progression, hostileEffects },
      userId,
      context.selection.scenario,
      outcome,
    );

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
