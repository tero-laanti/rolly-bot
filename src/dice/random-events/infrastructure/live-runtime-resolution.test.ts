import assert from "node:assert/strict";
import test from "node:test";
import {
  getRandomEventRetryPolicy,
  renderRandomEventOutcome,
  renderRandomEventScenario,
  validateRandomEventScenarios,
  type RandomEventScenario,
} from "../domain/content";
import type { RandomEventRollChallengeProgress } from "../domain/roll-challenges";
import type { DiceTemporaryEffect } from "../../progression/domain/temporary-effects";
import { buildActiveClaimDescription } from "./live-runtime-presentation";
import { resolveRandomEventAttempt } from "./live-runtime-resolution";

const createChallengeScenario = (): RandomEventScenario => {
  return {
    id: "test-bridge",
    rarity: "rare",
    title: "Test Bridge",
    prompt: "Cross the bridge.",
    claimLabel: "Cross",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    retryPolicy: "once-per-user",
    rollChallenge: {
      id: "bridge-check",
      mode: "single-step",
      steps: [
        {
          id: "step-one",
          label: "Roll 5+ on your die",
          source: { type: "player-die" },
          target: 5,
          comparator: "gte",
        },
      ],
    },
    challengeOutcomeIds: {
      success: ["clean-crossing"],
      failure: ["wet-plank"],
    },
    outcomes: [
      {
        id: "clean-crossing",
        resolution: "resolve-success",
        message: "You make the crossing cleanly.",
        effects: [],
      },
      {
        id: "wet-plank",
        resolution: "keep-open-failure",
        message: "You slip on the first plank and back away.",
        effects: [],
      },
    ],
  };
};

test("keep-open failures default to once-per-user retry policy", () => {
  const scenario = createChallengeScenario();
  scenario.retryPolicy = undefined;

  assert.equal(getRandomEventRetryPolicy(scenario), "once-per-user");
});

test("scenario validation rejects success mappings that point at failure outcomes", () => {
  const scenario = createChallengeScenario();
  scenario.challengeOutcomeIds = {
    success: ["wet-plank"],
    failure: ["clean-crossing"],
  };

  assert.throws(() => validateRandomEventScenarios([scenario]), /success outcomes/i);
});

test("scenario validation rejects keep-open failures that are unreachable from challenge failures", () => {
  const scenario = createChallengeScenario();
  scenario.outcomes.push({
    id: "hard-fail",
    resolution: "resolve-failure",
    message: "The bridge collapses.",
    effects: [],
  });
  scenario.challengeOutcomeIds = {
    success: ["clean-crossing"],
    failure: ["hard-fail"],
  };

  assert.throws(
    () => validateRandomEventScenarios([scenario]),
    /keep-open-failure outcomes must be reachable/i,
  );
});

test("keep-open attempt resolution logs the user and keeps the event open", () => {
  const scenario = createChallengeScenario();
  const selection = renderRandomEventScenario(scenario);
  const challengeProgress: RandomEventRollChallengeProgress = {
    challengeId: "bridge-check",
    mode: "single-step",
    nextStepIndex: 1,
    stepResults: [
      {
        stepId: "step-one",
        label: "Roll 5+ on your die",
        sourceType: "player-die",
        dieSides: 6,
        rolledValue: 2,
        target: 5,
        comparator: "gte",
        succeeded: false,
      },
    ],
    completed: true,
    succeeded: false,
  };

  const attempt = resolveRandomEventAttempt({
    progression: {
      getDiceSides: () => 6,
      getDiceBans: () => new Map(),
      applyDiceTemporaryEffect: () =>
        ({
          id: "effect-1",
          userId: "123",
          effectCode: "roll-pass-multiplier",
          kind: "positive",
          source: "test",
          magnitude: 2,
          remainingRolls: 1,
          expiresAt: null,
          consumeOnCommand: "dice",
          stackGroup: "roll-pass-multiplier",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }) as DiceTemporaryEffect,
    },
    hostileEffects: {
      applyShieldableNegativeLockout: () => ({ blockedByShield: false, lockoutUntilMs: null }),
      applyShieldableNegativeRollPenalty: () => ({ blockedByShield: false }),
    },
    selection,
    userId: "123",
    challengeProgress,
  });

  assert.equal(attempt.resolution, "keep-open-failure");
  assert.match(attempt.keepOpenLine, /<@123> failed:/);
  assert.match(attempt.keepOpenLine, /Rolled 2 \(d6\)/);
  assert.match(attempt.keepOpenLine, /still open/);
});

test("outcome text variables override scenario text variables for the same key", () => {
  const scenario: RandomEventScenario = {
    id: "override-test",
    rarity: "common",
    title: "Override Test",
    prompt: "A ${thing} is here.",
    claimLabel: "Inspect ${thing}",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    textVariables: {
      thing: ["crate"],
      mood: ["quiet"],
    },
    outcomes: [
      {
        id: "override-outcome",
        resolution: "resolve-success",
        message: "The ${thing} opens with a ${mood} click.",
        effects: [],
        textVariables: {
          thing: ["chest"],
        },
      },
    ],
  };

  const scenarioRender = renderRandomEventScenario(scenario, {
    random: () => 0,
  });
  const renderedOutcome = renderRandomEventOutcome(scenarioRender, scenario.outcomes[0]!, {
    random: () => 0,
  });

  assert.equal(scenarioRender.renderedPrompt, "A crate is here.");
  assert.equal(scenarioRender.renderedClaimLabel, "Inspect crate");
  assert.equal(renderedOutcome.renderedOutcomeMessage, "The chest opens with a quiet click.");
});

test("active event prompt truncates older failed attempts", () => {
  const description = buildActiveClaimDescription(
    "Test prompt",
    null,
    null,
    [],
    ["fail one", "fail two", "fail three", "fail four"],
  );

  assert.match(description, /Recent failed attempts/);
  assert.doesNotMatch(description, /fail one/);
  assert.match(description, /fail two/);
  assert.match(description, /\.\.\.and 1 more failed attempt/);
});
