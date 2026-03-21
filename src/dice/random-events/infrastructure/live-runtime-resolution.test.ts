import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "discord.js";
import {
  getRandomEventRetryPolicy,
  renderRandomEventOutcome,
  renderRandomEventScenario,
  validateRandomEventScenarios,
  type RandomEventScenario,
} from "../domain/content";
import type { RandomEventRollChallengeProgress } from "../domain/roll-challenges";
import type { DiceTemporaryEffect } from "../../progression/domain/temporary-effects";
import { buildActiveClaimDescription, buildExpiredEventEmbed } from "./live-runtime-presentation";
import { createRandomEventsState, registerActiveRandomEvent } from "./state-store";
import {
  resolveRandomEvent,
  resolveRandomEventAttempt,
  type RandomEventAttemptResolution,
} from "./live-runtime-resolution";

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

test("scenario validation rejects requiredReadyCount outside supported multi-user thresholds", () => {
  const scenario = createChallengeScenario();
  scenario.claimPolicy = "multi-user";
  scenario.requiredReadyCount = 6;

  assert.throws(() => validateRandomEventScenarios([scenario]), /between 2 and 5/i);
});

test("scenario validation rejects requiredReadyCount on first-click events", () => {
  const scenario = createChallengeScenario();
  scenario.requiredReadyCount = 3;

  assert.throws(() => validateRandomEventScenarios([scenario]), /only valid for multi-user/i);
});

test("keep-open attempt resolution logs a neutral failed-attempt history line", () => {
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
  assert.match(attempt.failedAttemptLine, /<@123> failed:/);
  assert.match(attempt.failedAttemptLine, /Rolled 2 \(d6\)/);
  assert.doesNotMatch(attempt.failedAttemptLine, /still open/);
});

test("shield-blocked negative outcomes report no applied negative effects", () => {
  const scenario: RandomEventScenario = {
    id: "blocked-negative-test",
    rarity: "common",
    title: "Blocked Negative Test",
    prompt: "A storm rolls in.",
    claimLabel: "Stand firm",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "lockout",
        resolution: "resolve-failure",
        message: "The storm should curse you.",
        effects: [
          {
            type: "temporary-lockout",
            durationMinutes: 10,
          },
        ],
      },
    ],
  };
  const selection = renderRandomEventScenario(scenario);

  const attempt = resolveRandomEventAttempt({
    progression: {
      getDiceSides: () => 6,
      getDiceBans: () => new Map(),
      applyDiceTemporaryEffect: () => {
        throw new Error("applyDiceTemporaryEffect should not be called in this test.");
      },
      getActiveDiceTemporaryEffects: () => [],
    },
    hostileEffects: {
      applyShieldableNegativeLockout: () => ({ blockedByShield: true, lockoutUntilMs: null }),
      applyShieldableNegativeRollPenalty: () => ({ blockedByShield: false }),
    },
    selection,
    userId: "123",
  });

  assert.deepEqual(attempt.appliedNegativeEffects, []);
  assert.equal(attempt.hadActiveNegativeEffectBeforeAttempt, false);
  assert.deepEqual(attempt.effectNotes, ["Bad Luck Umbrella blocked a negative event effect."]);
});

test("currency outcomes award pip amounts within the configured range", () => {
  const scenario: RandomEventScenario = {
    id: "currency-test",
    rarity: "common",
    title: "Currency Test",
    prompt: "You spot a loose pouch.",
    claimLabel: "Grab it",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "coins",
        resolution: "resolve-success",
        message: "You catch the pouch before it falls.",
        effects: [
          {
            type: "currency",
            minAmount: 2,
            maxAmount: 4,
          },
        ],
      },
    ],
  };
  const selection = renderRandomEventScenario(scenario);
  const awarded: number[] = [];

  const attempt = resolveRandomEventAttempt({
    economy: {
      applyPipsDelta: ({ amount }) => {
        awarded.push(amount);
        return amount;
      },
    },
    progression: {
      getDiceSides: () => 6,
      getDiceBans: () => new Map(),
      applyDiceTemporaryEffect: () => {
        throw new Error("applyDiceTemporaryEffect should not be called in this test.");
      },
      getActiveDiceTemporaryEffects: () => [],
    },
    hostileEffects: {
      applyShieldableNegativeLockout: () => ({ blockedByShield: false, lockoutUntilMs: null }),
      applyShieldableNegativeRollPenalty: () => ({ blockedByShield: false }),
    },
    selection,
    userId: "123",
    random: () => 0.999,
  });

  assert.deepEqual(awarded, [4]);
  assert.equal(attempt.pipReward, 4);
  assert.match(attempt.finalLine, /Gained 4 pips\./);
});

test("attempt resolution detects an already-active negative effect before applying a new curse", () => {
  const scenario: RandomEventScenario = {
    id: "overlap-negative-test",
    rarity: "common",
    title: "Overlap Negative Test",
    prompt: "A shadow circles overhead.",
    claimLabel: "Look up",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "penalty",
        resolution: "resolve-failure",
        message: "The shadow drains your luck.",
        effects: [
          {
            type: "temporary-roll-penalty",
            divisor: 2,
            rolls: 1,
            stackMode: "replace",
          },
        ],
      },
    ],
  };
  const selection = renderRandomEventScenario(scenario);

  const attempt = resolveRandomEventAttempt({
    progression: {
      getDiceSides: () => 6,
      getDiceBans: () => new Map(),
      applyDiceTemporaryEffect: () => {
        throw new Error("applyDiceTemporaryEffect should not be called in this test.");
      },
      getActiveDiceTemporaryEffects: () => [
        {
          id: "effect-1",
          userId: "123",
          effectCode: "roll-pass-divisor",
          kind: "negative",
          source: "test",
          magnitude: 2,
          remainingRolls: 1,
          expiresAt: null,
          consumeOnCommand: "dice",
          stackGroup: "roll-pass-divisor",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } satisfies DiceTemporaryEffect,
      ],
    },
    hostileEffects: {
      applyShieldableNegativeLockout: () => ({ blockedByShield: false, lockoutUntilMs: null }),
      applyShieldableNegativeRollPenalty: () => ({ blockedByShield: false }),
    },
    selection,
    userId: "123",
  });

  assert.equal(attempt.hadActiveNegativeEffectBeforeAttempt, true);
  assert.deepEqual(attempt.appliedNegativeEffects, [{ type: "temporary-roll-penalty" }]);
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

  assert.equal(scenarioRender.renderedPrompt, "A chest is here.");
  assert.equal(scenarioRender.renderedClaimLabel, "Inspect chest");
  assert.equal(renderedOutcome.renderedOutcomeMessage, "The chest opens with a quiet click.");
});

test("scenario placeholders can be satisfied by outcome-only text variables", () => {
  const scenario: RandomEventScenario = {
    id: "outcome-placeholder-test",
    rarity: "common",
    title: "A ${thing} appears",
    prompt: "The ${thing} hums quietly.",
    claimLabel: "Inspect ${thing}",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "outcome-placeholder",
        resolution: "resolve-success",
        message: "You pocket the ${thing}.",
        effects: [],
        textVariables: {
          thing: ["relic"],
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

  assert.equal(scenarioRender.renderedTitle, "A relic appears");
  assert.equal(scenarioRender.renderedPrompt, "The relic hums quietly.");
  assert.equal(scenarioRender.renderedClaimLabel, "Inspect relic");
  assert.equal(renderedOutcome.renderedOutcomeMessage, "You pocket the relic.");
});

test("outcome rendering keeps open-state placeholders stable when outcomes disagree", () => {
  const scenario: RandomEventScenario = {
    id: "stable-placeholder-test",
    rarity: "common",
    title: "A ${thing} appears",
    prompt: "The ${thing} pulses with light.",
    claimLabel: "Grab ${thing}",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "first-outcome",
        resolution: "resolve-success",
        message: "You grab the ${thing} before it fades.",
        effects: [],
        textVariables: {
          thing: ["orb"],
        },
      },
      {
        id: "second-outcome",
        resolution: "resolve-success",
        message: "The ${thing} slips into your pack.",
        effects: [],
        textVariables: {
          thing: ["relic"],
        },
      },
    ],
  };

  const scenarioRender = renderRandomEventScenario(scenario, {
    random: () => 0.999,
  });
  const renderedOutcome = renderRandomEventOutcome(scenarioRender, scenario.outcomes[0]!, {
    random: () => 0,
  });

  assert.equal(scenarioRender.renderedTitle, "A relic appears");
  assert.equal(scenarioRender.renderedPrompt, "The relic pulses with light.");
  assert.equal(scenarioRender.renderedClaimLabel, "Grab relic");
  assert.equal(renderedOutcome.renderedOutcomeMessage, "You grab the relic before it fades.");
});

test("outcome-only placeholders outside the open prompt resolve from the selected outcome", () => {
  const scenario: RandomEventScenario = {
    id: "outcome-only-resolution-test",
    rarity: "common",
    title: "A sealed chest waits",
    prompt: "The lock looks fragile.",
    claimLabel: "Open it",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    textVariables: {
      reward: ["dust"],
    },
    outcomes: [
      {
        id: "coins",
        resolution: "resolve-success",
        message: "You find ${reward} inside.",
        effects: [],
        textVariables: {
          reward: ["coins"],
        },
      },
      {
        id: "gems",
        resolution: "resolve-success",
        message: "You find ${reward} inside.",
        effects: [],
        textVariables: {
          reward: ["gems"],
        },
      },
    ],
  };

  const scenarioRender = renderRandomEventScenario(scenario, {
    random: () => 0,
  });
  const renderedOutcome = renderRandomEventOutcome(scenarioRender, scenario.outcomes[1]!, {
    random: () => 0,
  });

  assert.equal(scenarioRender.renderedPrompt, "The lock looks fragile.");
  assert.equal(renderedOutcome.renderedOutcomeMessage, "You find gems inside.");
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
  assert.match(description, /The event is still open\./);
});

test("expired event history does not reuse open-state retry wording", () => {
  const selection = renderRandomEventScenario(createChallengeScenario(), {
    random: () => 0,
  });
  const description = buildExpiredEventEmbed(selection, [
    "<@123> failed: Rolled 2 (d6). You slip on the first plank and back away.",
  ]).toJSON().description;

  assert.ok(description);
  assert.match(description, /Recent failed attempts/);
  assert.doesNotMatch(description, /still open/);
  assert.match(description, /The window closes before anyone pulls it off\./);
});

const resolveMultiUserScenarioDescription = async (
  scenario: RandomEventScenario,
): Promise<string | undefined> => {
  const selection = renderRandomEventScenario(scenario, {
    random: () => 0,
  });
  const editedPayloads: Array<{ embeds?: Array<{ description?: string }> }> = [];
  const message = {
    edit: async (payload: { embeds?: Array<{ description?: string }> }) => {
      editedPayloads.push(payload);
    },
  } as unknown as Message;
  const activeEventsById = new Map([
    [
      "event-1",
      {
        eventId: "event-1",
        selection,
        message,
        sequenceChallenge: null,
        currentPhaseExpiresAtMs: Date.now() + 60_000,
        attemptedUserIds: new Set<string>(),
        failedAttemptLines: [],
        failedAttemptUserIds: new Set<string>(),
      },
    ],
  ]);
  const state = createRandomEventsState();
  registerActiveRandomEvent(state, {
    id: "event-1",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });

  const originalRandom = Math.random;
  Math.random = (() => {
    const values = [0, 0.999];
    let index = 0;
    return () => values[index++] ?? 0.999;
  })();

  try {
    await resolveRandomEvent({
      activeEventsById,
      state,
      progression: {
        getDiceSides: () => 6,
        getDiceBans: () => new Map(),
        applyDiceTemporaryEffect: () => {
          throw new Error("applyDiceTemporaryEffect should not be called in this test.");
        },
      },
      hostileEffects: {
        applyShieldableNegativeLockout: () => ({ blockedByShield: false, lockoutUntilMs: null }),
        applyShieldableNegativeRollPenalty: () => ({ blockedByShield: false }),
      },
      eventId: "event-1",
      participants: ["111", "222"],
    });
  } finally {
    Math.random = originalRandom;
  }

  return editedPayloads[0]?.embeds?.[0]?.description;
};

test("multi-user events without challenge branching reuse one rendered outcome for all participants", async () => {
  const scenario: RandomEventScenario = {
    id: "shared-group-outcome",
    rarity: "uncommon",
    title: "Shared Group Outcome",
    prompt: "Everyone crowds around the same shrine.",
    claimLabel: "Gather",
    claimPolicy: "multi-user",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "shared-outcome",
        resolution: "resolve-success",
        message: "The shrine answers with a ${sign}.",
        effects: [],
        textVariables: {
          sign: ["bell", "mirror"],
        },
      },
    ],
  };

  const description = await resolveMultiUserScenarioDescription(scenario);

  assert.ok(description);
  const sharedOutcomeMatch = description.match(
    /<@111>: Success: The shrine answers with a (bell|mirror)\.\n<@222>: Success: The shrine answers with a \1\./,
  );
  assert.ok(sharedOutcomeMatch);
});

test("multi-user events reuse one currency amount for all participants in a shared outcome", async () => {
  const scenario: RandomEventScenario = {
    id: "shared-group-currency",
    rarity: "uncommon",
    title: "Shared Group Currency",
    prompt: "Everyone crowds around the same chest.",
    claimLabel: "Open chest",
    claimPolicy: "multi-user",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "shared-payout",
        resolution: "resolve-success",
        message: "The chest clicks open.",
        effects: [
          {
            type: "currency",
            minAmount: 2,
            maxAmount: 4,
          },
        ],
      },
    ],
  };
  const selection = renderRandomEventScenario(scenario, {
    random: () => 0,
  });
  const message = {
    edit: async () => {},
  } as unknown as Message;
  const activeEventsById = new Map([
    [
      "event-shared-currency",
      {
        eventId: "event-shared-currency",
        selection,
        message,
        sequenceChallenge: null,
        currentPhaseExpiresAtMs: Date.now() + 60_000,
        attemptedUserIds: new Set<string>(),
        failedAttemptLines: [],
        failedAttemptUserIds: new Set<string>(),
      },
    ],
  ]);
  const state = createRandomEventsState();
  registerActiveRandomEvent(state, {
    id: "event-shared-currency",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const awarded: number[] = [];

  const originalRandom = Math.random;
  Math.random = (() => {
    const values = [0, 0, 0.999];
    let index = 0;
    return () => values[index++] ?? 0.999;
  })();

  try {
    await resolveRandomEvent({
      activeEventsById,
      state,
      economy: {
        applyPipsDelta: ({ amount }) => {
          awarded.push(amount);
          return amount;
        },
      },
      progression: {
        getDiceSides: () => 6,
        getDiceBans: () => new Map(),
        applyDiceTemporaryEffect: () => {
          throw new Error("applyDiceTemporaryEffect should not be called in this test.");
        },
      },
      hostileEffects: {
        applyShieldableNegativeLockout: () => ({ blockedByShield: false, lockoutUntilMs: null }),
        applyShieldableNegativeRollPenalty: () => ({ blockedByShield: false }),
      },
      eventId: "event-shared-currency",
      participants: ["111", "222"],
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(awarded, [2, 2]);
});

test("multi-user events ignore stray challengeOutcomeIds when there is no roll challenge", async () => {
  const scenario: RandomEventScenario = {
    id: "shared-outcome-stray-branching",
    rarity: "uncommon",
    title: "Shared Outcome Stray Branching",
    prompt: "Everyone crowds around the same shrine.",
    claimLabel: "Gather",
    claimPolicy: "multi-user",
    claimWindowSeconds: 60,
    challengeOutcomeIds: {
      success: ["shared-outcome"],
      failure: ["shared-outcome"],
    },
    outcomes: [
      {
        id: "shared-outcome",
        resolution: "resolve-success",
        message: "The shrine answers with a ${sign}.",
        effects: [],
        textVariables: {
          sign: ["bell", "mirror"],
        },
      },
    ],
  };

  const description = await resolveMultiUserScenarioDescription(scenario);

  assert.ok(description);
  const sharedOutcomeMatch = description.match(
    /<@111>: Success: The shrine answers with a (bell|mirror)\.\n<@222>: Success: The shrine answers with a \1\./,
  );
  assert.ok(sharedOutcomeMatch);
});

test("threshold multi-user events expire if the required ready count is not met", async () => {
  const scenario: RandomEventScenario = {
    id: "threshold-expiry",
    rarity: "rare",
    title: "Threshold Expiry",
    prompt: "The gate needs a team to push it open.",
    claimLabel: "Push gate",
    claimPolicy: "multi-user",
    claimWindowSeconds: 60,
    requiredReadyCount: 3,
    outcomes: [
      {
        id: "gate-opens",
        resolution: "resolve-success",
        message: "The gate gives way.",
        effects: [],
      },
    ],
  };

  const selection = renderRandomEventScenario(scenario, {
    random: () => 0,
  });
  const editedPayloads: Array<{
    embeds?: Array<{ description?: string; footer?: { text?: string } }>;
  }> = [];
  const message = {
    edit: async (payload: {
      embeds?: Array<{ description?: string; footer?: { text?: string } }>;
    }) => {
      editedPayloads.push(payload);
    },
  } as unknown as Message;
  const activeEventsById = new Map([
    [
      "event-2",
      {
        eventId: "event-2",
        selection,
        message,
        sequenceChallenge: null,
        currentPhaseExpiresAtMs: Date.now() + 60_000,
        attemptedUserIds: new Set<string>(),
        failedAttemptLines: [],
        failedAttemptUserIds: new Set<string>(),
      },
    ],
  ]);
  const state = createRandomEventsState();
  registerActiveRandomEvent(state, {
    id: "event-2",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });

  await resolveRandomEvent({
    activeEventsById,
    state,
    progression: {
      getDiceSides: () => 6,
      getDiceBans: () => new Map(),
      applyDiceTemporaryEffect: () => {
        throw new Error("applyDiceTemporaryEffect should not be called in this test.");
      },
    },
    hostileEffects: {
      applyShieldableNegativeLockout: () => ({ blockedByShield: false, lockoutUntilMs: null }),
      applyShieldableNegativeRollPenalty: () => ({ blockedByShield: false }),
    },
    eventId: "event-2",
    participants: ["111", "222"],
  });

  const expiredEmbed = editedPayloads[0]?.embeds?.[0];
  assert.ok(expiredEmbed?.description);
  assert.match(expiredEmbed.description, /Only 2\/3 players were ready before time ran out\./);
  assert.match(expiredEmbed.description, /\*\*Ready players:\*\* <@111>, <@222>/);
  assert.equal(expiredEmbed.footer?.text, "Rare Event • Expired");
});

test("keep-open comeback progress only counts when the same user failed before succeeding", async () => {
  const scenario: RandomEventScenario = {
    id: "keep-open-comeback-attribution",
    rarity: "rare",
    title: "Keep-open Comeback Attribution",
    prompt: "Force the gate open.",
    claimLabel: "Push",
    claimPolicy: "first-click",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "gate-opens",
        resolution: "resolve-success",
        message: "The gate opens.",
        effects: [],
      },
    ],
  };
  const selection = renderRandomEventScenario(scenario, {
    random: () => 0,
  });
  const successResolution = (userId: string): RandomEventAttemptResolution => ({
    userId,
    outcome: {
      id: "gate-opens",
      resolution: "resolve-success",
      message: "The gate opens.",
      effects: [],
    },
    renderedOutcomeMessage: "The gate opens.",
    challengeRollSummary: null,
    effectNotes: [],
    pipReward: 0,
    appliedNegativeEffects: [],
    hadActiveNegativeEffectBeforeAttempt: false,
    resolutionNote: null,
    resolution: "resolve-success",
    finalLine: `<@${userId}>: Success: The gate opens.`,
    failedAttemptLine: `<@${userId}> failed: The gate stays shut.`,
  });
  const resolveComebackFlag = async ({
    failedAttemptUserIds,
    participant,
    eventId,
  }: {
    failedAttemptUserIds: Set<string>;
    participant: string;
    eventId: string;
  }): Promise<boolean | undefined> => {
    const message = {
      edit: async () => {},
    } as unknown as Message;
    const activeEventsById = new Map([
      [
        eventId,
        {
          eventId,
          selection,
          message,
          sequenceChallenge: null,
          currentPhaseExpiresAtMs: Date.now() + 60_000,
          attemptedUserIds: new Set<string>(),
          failedAttemptLines: ["<@111> failed: The gate stays shut."],
          failedAttemptUserIds,
        },
      ],
    ]);
    const state = createRandomEventsState();
    registerActiveRandomEvent(state, {
      id: eventId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    let recordedFlag: boolean | undefined;

    await resolveRandomEvent({
      activeEventsById,
      state,
      progression: {
        getDiceSides: () => 6,
        getDiceBans: () => new Map(),
        applyDiceTemporaryEffect: () => {
          throw new Error("applyDiceTemporaryEffect should not be called in this test.");
        },
      },
      hostileEffects: {
        applyShieldableNegativeLockout: () => ({ blockedByShield: false, lockoutUntilMs: null }),
        applyShieldableNegativeRollPenalty: () => ({ blockedByShield: false }),
      },
      eventId,
      participants: [participant],
      attemptResolutionsByUserId: new Map([[participant, successResolution(participant)]]),
      onAttemptResolved: ({ hadKeepOpenFailureBeforeSuccess }) => {
        recordedFlag = hadKeepOpenFailureBeforeSuccess;
        return null;
      },
    });

    return recordedFlag;
  };

  assert.equal(
    await resolveComebackFlag({
      failedAttemptUserIds: new Set(["111"]),
      participant: "111",
      eventId: "event-same-user",
    }),
    true,
  );
  assert.equal(
    await resolveComebackFlag({
      failedAttemptUserIds: new Set(["111"]),
      participant: "222",
      eventId: "event-other-user",
    }),
    false,
  );
});
