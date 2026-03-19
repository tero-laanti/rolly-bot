import type { RandomEventClaimPolicy } from "./claim-policy";
import {
  type RandomEventRollChallengeDefinition,
  validateRollChallengeDefinition,
} from "./roll-challenges";
import {
  createRandomEventVarietyState,
  selectRandomEventTemplateWithVariety,
  type RandomEventRarityTier,
  type RandomEventVarietyOptions,
  type RandomEventVarietyState,
  type RandomEventVarietyTemplate,
} from "./variety";

export type RandomEventEffect =
  | {
      type: "currency";
      minAmount: number;
      maxAmount: number;
    }
  | {
      type: "temporary-roll-multiplier";
      multiplier: number;
      rolls: number;
      stackMode: "stack" | "refresh" | "replace" | "no-stack";
    }
  | {
      type: "temporary-roll-penalty";
      divisor: number;
      rolls: number;
      stackMode: "refresh" | "replace" | "no-stack";
    }
  | {
      type: "temporary-lockout";
      durationMinutes: number;
    };

export type RandomEventOutcomeResolution =
  | "resolve-success"
  | "resolve-failure"
  | "keep-open-failure";

export type RandomEventRetryPolicy = "once-per-user" | "allow-retry";

export type RandomEventTextVariables = Record<string, string[]>;

export type RandomEventClaimActivityTemplates = {
  accepted: string[];
  alreadyReady: string[];
};

export type RandomEventOutcome = {
  id: string;
  weight?: number;
  resolution: RandomEventOutcomeResolution;
  message: string;
  effects: RandomEventEffect[];
  textVariables?: RandomEventTextVariables;
};

export type RandomEventChallengeOutcomeIds = {
  success: string[];
  failure: string[];
};

export type RandomEventScenario = {
  id: string;
  rarity: RandomEventRarityTier;
  title: string;
  prompt: string;
  claimLabel: string;
  claimPolicy: RandomEventClaimPolicy;
  claimWindowSeconds: number;
  weight?: number;
  retryPolicy?: RandomEventRetryPolicy;
  textVariables?: RandomEventTextVariables;
  rollChallenge?: RandomEventRollChallengeDefinition;
  challengeOutcomeIds?: RandomEventChallengeOutcomeIds;
  outcomes: RandomEventOutcome[];
  activityTemplates?: RandomEventClaimActivityTemplates;
};

export type RandomEventScenarioRender = {
  scenario: RandomEventScenario;
  renderedTitle: string;
  renderedPrompt: string;
  renderedClaimLabel: string;
  textVariableValues: Record<string, string>;
};

export type RandomEventSelectionResult = RandomEventScenarioRender;

export type RandomEventRenderedOutcome = RandomEventScenarioRender & {
  selectedOutcome: RandomEventOutcome;
  renderedOutcomeMessage: string;
};

export type SelectRandomEventScenarioOptions = RandomEventVarietyOptions & {
  challengeResult?: "success" | "failure";
};

const templateVariablePattern = /\$\{([a-zA-Z0-9_]+)\}/g;

const toVarietyTemplate = (scenario: RandomEventScenario): RandomEventVarietyTemplate => {
  return {
    id: scenario.id,
    rarity: scenario.rarity,
    weight: scenario.weight,
  };
};

export const createRandomEventContentState = (): RandomEventVarietyState => {
  return createRandomEventVarietyState();
};

const normalizePositiveNumber = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, value ?? fallback);
};

const getRandomUnit = (random: (() => number) | undefined): number => {
  const value = (random ?? Math.random)();
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0.999999, value));
};

const pickWeightedOutcome = (
  outcomes: RandomEventOutcome[],
  random: (() => number) | undefined,
): RandomEventOutcome | null => {
  if (outcomes.length < 1) {
    return null;
  }

  const normalizedOutcomes = outcomes.map((outcome) => ({
    outcome,
    weight: normalizePositiveNumber(outcome.weight, 1),
  }));

  const positiveWeightOutcomes = normalizedOutcomes.filter((entry) => entry.weight > 0);
  const candidates =
    positiveWeightOutcomes.length > 0 ? positiveWeightOutcomes : normalizedOutcomes;
  if (candidates.length < 1) {
    return null;
  }

  const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    const index = Math.floor(getRandomUnit(random) * candidates.length);
    return candidates[index]?.outcome ?? candidates[0]?.outcome ?? null;
  }

  let cursor = getRandomUnit(random) * totalWeight;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor < 0) {
      return candidate.outcome;
    }
  }

  return candidates[candidates.length - 1]?.outcome ?? null;
};

const getOutcomeCandidates = (
  scenario: RandomEventScenario,
  challengeResult: "success" | "failure" | undefined,
): RandomEventOutcome[] => {
  if (!scenario.rollChallenge || !challengeResult || !scenario.challengeOutcomeIds) {
    return scenario.outcomes;
  }

  const outcomeIds = new Set(scenario.challengeOutcomeIds[challengeResult]);
  const challengeOutcomes = scenario.outcomes.filter((outcome) => outcomeIds.has(outcome.id));
  return challengeOutcomes.length > 0 ? challengeOutcomes : scenario.outcomes;
};

const validateTextVariables = (
  ownerLabel: string,
  variables: RandomEventTextVariables | undefined,
): void => {
  if (!variables) {
    return;
  }

  for (const [key, values] of Object.entries(variables)) {
    if (key.trim().length < 1) {
      throw new Error(`${ownerLabel} has an empty text variable key.`);
    }

    if (!Array.isArray(values) || values.length < 1) {
      throw new Error(`${ownerLabel} variable '${key}' must have at least one value.`);
    }

    for (const value of values) {
      if (typeof value !== "string" || value.trim().length < 1) {
        throw new Error(`${ownerLabel} variable '${key}' includes an empty value.`);
      }
    }
  }
};

const validateClaimActivityTemplates = (
  ownerLabel: string,
  templates: RandomEventClaimActivityTemplates | undefined,
): void => {
  if (!templates) {
    return;
  }

  for (const [key, values] of Object.entries(templates) as Array<
    [keyof RandomEventClaimActivityTemplates, string[]]
  >) {
    if (!Array.isArray(values) || values.length < 1) {
      throw new Error(`${ownerLabel} activityTemplates.${key} must have at least one value.`);
    }

    for (const value of values) {
      if (typeof value !== "string" || value.trim().length < 1) {
        throw new Error(`${ownerLabel} activityTemplates.${key} includes an empty value.`);
      }
    }
  }
};

const validateChallengeOutcomeIds = (scenario: RandomEventScenario): void => {
  if (!scenario.challengeOutcomeIds) {
    return;
  }

  const outcomesById = new Map(scenario.outcomes.map((outcome) => [outcome.id, outcome]));
  for (const [key, outcomeIds] of Object.entries(scenario.challengeOutcomeIds) as Array<
    ["success" | "failure", string[]]
  >) {
    if (!Array.isArray(outcomeIds) || outcomeIds.length < 1) {
      throw new Error(
        `Scenario ${scenario.id} challengeOutcomeIds.${key} must have at least one id.`,
      );
    }

    for (const outcomeId of outcomeIds) {
      const outcome = outcomesById.get(outcomeId);
      if (!outcome) {
        throw new Error(
          `Scenario ${scenario.id} challengeOutcomeIds.${key} references missing outcome '${outcomeId}'.`,
        );
      }

      if (key === "success" && outcome.resolution !== "resolve-success") {
        throw new Error(
          `Scenario ${scenario.id} challengeOutcomeIds.success must reference only success outcomes.`,
        );
      }

      if (key === "failure" && outcome.resolution === "resolve-success") {
        throw new Error(
          `Scenario ${scenario.id} challengeOutcomeIds.failure must reference only failure outcomes.`,
        );
      }
    }
  }
};

export const getRandomEventRetryPolicy = (
  scenario: RandomEventScenario,
): RandomEventRetryPolicy | null => {
  if (!scenario.outcomes.some((outcome) => outcome.resolution === "keep-open-failure")) {
    return null;
  }

  return scenario.retryPolicy ?? "once-per-user";
};

export const isRandomEventKeepOpenFailure = (outcome: RandomEventOutcome): boolean => {
  return outcome.resolution === "keep-open-failure";
};

const validateScenario = (scenario: RandomEventScenario): void => {
  if (scenario.id.trim().length < 1) {
    throw new Error("Random event scenario id cannot be empty.");
  }

  if (scenario.title.trim().length < 1) {
    throw new Error(`Random event scenario ${scenario.id} must have a title.`);
  }

  if (scenario.prompt.trim().length < 1) {
    throw new Error(`Random event scenario ${scenario.id} must have a prompt.`);
  }

  if (scenario.claimWindowSeconds < 10) {
    throw new Error(`Random event scenario ${scenario.id} must have at least 10s claim window.`);
  }

  if (scenario.outcomes.length < 1) {
    throw new Error(`Random event scenario ${scenario.id} must define at least one outcome.`);
  }

  if (scenario.rollChallenge) {
    validateRollChallengeDefinition(scenario.rollChallenge);
  }

  validateTextVariables(`scenario ${scenario.id}`, scenario.textVariables);
  validateClaimActivityTemplates(`scenario ${scenario.id}`, scenario.activityTemplates);

  const outcomeIds = new Set<string>();
  let hasKeepOpenFailure = false;
  for (const outcome of scenario.outcomes) {
    if (outcome.id.trim().length < 1) {
      throw new Error(`Scenario ${scenario.id} has an outcome with empty id.`);
    }

    if (outcomeIds.has(outcome.id)) {
      throw new Error(`Scenario ${scenario.id} has duplicate outcome id ${outcome.id}.`);
    }

    outcomeIds.add(outcome.id);

    if (outcome.message.trim().length < 1) {
      throw new Error(`Scenario ${scenario.id} outcome ${outcome.id} must have a message.`);
    }

    validateTextVariables(`scenario ${scenario.id} outcome ${outcome.id}`, outcome.textVariables);

    if (outcome.resolution === "keep-open-failure") {
      hasKeepOpenFailure = true;
    }
  }

  if (scenario.rollChallenge) {
    validateChallengeOutcomeIds(scenario);
  }

  if (hasKeepOpenFailure && scenario.claimPolicy !== "first-click") {
    throw new Error(
      `Scenario ${scenario.id} keep-open-failure outcomes are only supported for first-click events.`,
    );
  }

  if (hasKeepOpenFailure && !scenario.rollChallenge) {
    throw new Error(
      `Scenario ${scenario.id} keep-open-failure outcomes require an explicit rollChallenge.`,
    );
  }

  if (hasKeepOpenFailure && !scenario.challengeOutcomeIds?.failure?.length) {
    throw new Error(
      `Scenario ${scenario.id} keep-open-failure outcomes must be reachable from challengeOutcomeIds.failure.`,
    );
  }

  if (!hasKeepOpenFailure && scenario.retryPolicy) {
    throw new Error(
      `Scenario ${scenario.id} retryPolicy is only valid for events with keep-open failures.`,
    );
  }
};

const selectTextVariableValues = (
  scenarioVariables: RandomEventTextVariables | undefined,
  outcomeVariables: RandomEventTextVariables | undefined,
  random: (() => number) | undefined,
  baseValues: Record<string, string> = {},
): Record<string, string> => {
  const merged: RandomEventTextVariables = {
    ...(scenarioVariables ?? {}),
    ...(outcomeVariables ?? {}),
  };

  const selectedValues: Record<string, string> = { ...baseValues };
  for (const [key, values] of Object.entries(merged)) {
    if (values.length < 1 || selectedValues[key]) {
      continue;
    }

    const index = Math.floor(getRandomUnit(random) * values.length);
    selectedValues[key] = values[index] ?? values[0] ?? key;
  }

  return selectedValues;
};

const renderTemplatedText = (template: string, selectedValues: Record<string, string>): string => {
  return template.replace(templateVariablePattern, (match, key: string) => {
    return selectedValues[key] ?? match;
  });
};

export const selectRandomEventOutcomeForScenario = (
  scenario: RandomEventScenario,
  options: SelectRandomEventScenarioOptions = {},
): RandomEventOutcome | null => {
  return pickWeightedOutcome(
    getOutcomeCandidates(scenario, options.challengeResult),
    options.random,
  );
};

export const renderRandomEventScenario = (
  scenario: RandomEventScenario,
  options: { random?: () => number } = {},
): RandomEventScenarioRender => {
  const textVariableValues = selectTextVariableValues(
    scenario.textVariables,
    undefined,
    options.random,
  );

  return {
    scenario,
    renderedTitle: renderTemplatedText(scenario.title, textVariableValues),
    renderedPrompt: renderTemplatedText(scenario.prompt, textVariableValues),
    renderedClaimLabel: renderTemplatedText(scenario.claimLabel, textVariableValues),
    textVariableValues,
  };
};

export const renderRandomEventOutcome = (
  scenarioRender: RandomEventScenarioRender,
  selectedOutcome: RandomEventOutcome,
  options: { random?: () => number } = {},
): RandomEventRenderedOutcome => {
  const textVariableValues = selectTextVariableValues(
    scenarioRender.scenario.textVariables,
    selectedOutcome.textVariables,
    options.random,
    scenarioRender.textVariableValues,
  );

  return {
    ...scenarioRender,
    selectedOutcome,
    renderedOutcomeMessage: renderTemplatedText(selectedOutcome.message, textVariableValues),
    textVariableValues,
  };
};

export const validateRandomEventScenarios = (scenarios: RandomEventScenario[]): void => {
  const ids = new Set<string>();
  for (const scenario of scenarios) {
    validateScenario(scenario);
    if (ids.has(scenario.id)) {
      throw new Error(`Duplicate random event scenario id: ${scenario.id}`);
    }

    ids.add(scenario.id);
  }
};

export const selectRandomEventScenario = (
  scenarios: RandomEventScenario[],
  state: RandomEventVarietyState,
  options: SelectRandomEventScenarioOptions = {},
): RandomEventScenarioRender | null => {
  if (scenarios.length < 1) {
    return null;
  }

  validateRandomEventScenarios(scenarios);

  const selectedTemplate = selectRandomEventTemplateWithVariety(
    scenarios.map(toVarietyTemplate),
    state,
    options,
  );
  if (!selectedTemplate) {
    return null;
  }

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedTemplate.id);
  if (!selectedScenario) {
    return null;
  }

  return renderRandomEventScenario(selectedScenario, {
    random: options.random,
  });
};
