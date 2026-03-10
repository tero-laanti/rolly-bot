import { rollDieWithBans } from "../../progression/domain/bans";

export type RandomEventRollComparator = "gte" | "lte" | "eq";

export type RandomEventRollSource =
  | {
      type: "player-die";
      dieIndex?: number;
      useBans?: boolean;
    }
  | {
      type: "static-die";
      sides: number;
    };

export type RandomEventRollChallengeStep = {
  id: string;
  label: string;
  source: RandomEventRollSource;
  target: number;
  comparator: RandomEventRollComparator;
};

export type RandomEventRollChallengeDefinition = {
  id: string;
  mode: "single-step" | "sequence";
  steps: RandomEventRollChallengeStep[];
  failOnFirstMiss?: boolean;
};

export type RandomEventRollChallengeStepResult = {
  stepId: string;
  label: string;
  sourceType: RandomEventRollSource["type"];
  dieSides: number;
  rolledValue: number;
  target: number;
  comparator: RandomEventRollComparator;
  succeeded: boolean;
};

export type RandomEventRollChallengeProgress = {
  challengeId: string;
  mode: RandomEventRollChallengeDefinition["mode"];
  nextStepIndex: number;
  stepResults: RandomEventRollChallengeStepResult[];
  completed: boolean;
  succeeded: boolean | null;
};

export type RandomEventRollChallengePlayerDice = {
  getDiceSides: (userId: string) => number;
  getDiceBans: (userId: string) => Map<number, Set<number>>;
};

export type AdvanceRollChallengeInput = {
  playerDice: RandomEventRollChallengePlayerDice;
  userId: string;
  challenge: RandomEventRollChallengeDefinition;
  progress: RandomEventRollChallengeProgress;
};

const getRandomUnit = (): number => {
  const value = Math.random();
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0.999999, value));
};

const evaluateComparator = (
  rolledValue: number,
  target: number,
  comparator: RandomEventRollComparator,
): boolean => {
  if (comparator === "eq") {
    return rolledValue === target;
  }

  if (comparator === "lte") {
    return rolledValue <= target;
  }

  return rolledValue >= target;
};

const getStaticDieRoll = (sides: number): number => {
  const normalizedSides = Math.max(2, Math.floor(sides));
  return Math.floor(getRandomUnit() * normalizedSides) + 1;
};

const rollFromPlayerDie = (
  playerDice: RandomEventRollChallengePlayerDice,
  userId: string,
  source: Extract<RandomEventRollSource, { type: "player-die" }>,
): { dieSides: number; rolledValue: number } => {
  const dieSides = playerDice.getDiceSides(userId);
  if (!source.useBans) {
    return {
      dieSides,
      rolledValue: Math.floor(getRandomUnit() * dieSides) + 1,
    };
  }

  const dieIndex = source.dieIndex ?? 1;
  const bansByDie = playerDice.getDiceBans(userId);
  const bannedValues = bansByDie.get(dieIndex) ?? null;
  return {
    dieSides,
    rolledValue: rollDieWithBans(bannedValues, dieSides),
  };
};

const resolveStepRoll = (
  playerDice: RandomEventRollChallengePlayerDice,
  userId: string,
  step: RandomEventRollChallengeStep,
): { dieSides: number; rolledValue: number } => {
  if (step.source.type === "static-die") {
    const dieSides = Math.max(2, Math.floor(step.source.sides));
    return {
      dieSides,
      rolledValue: getStaticDieRoll(dieSides),
    };
  }

  return rollFromPlayerDie(playerDice, userId, step.source);
};

const validateChallengeStep = (challengeId: string, step: RandomEventRollChallengeStep): void => {
  if (step.id.trim().length < 1) {
    throw new Error(`Challenge ${challengeId} has step with empty id.`);
  }

  if (step.label.trim().length < 1) {
    throw new Error(`Challenge ${challengeId} step ${step.id} must have a label.`);
  }

  if (!Number.isFinite(step.target)) {
    throw new Error(`Challenge ${challengeId} step ${step.id} target must be finite.`);
  }

  if (step.source.type === "static-die") {
    if (!Number.isFinite(step.source.sides) || step.source.sides < 2) {
      throw new Error(`Challenge ${challengeId} step ${step.id} static die must be >= 2 sides.`);
    }
  }
};

export const validateRollChallengeDefinition = (
  challenge: RandomEventRollChallengeDefinition,
): void => {
  if (challenge.id.trim().length < 1) {
    throw new Error("Roll challenge id cannot be empty.");
  }

  if (challenge.steps.length < 1) {
    throw new Error(`Roll challenge ${challenge.id} must include at least one step.`);
  }

  const ids = new Set<string>();
  for (const step of challenge.steps) {
    validateChallengeStep(challenge.id, step);
    if (ids.has(step.id)) {
      throw new Error(`Roll challenge ${challenge.id} has duplicate step id ${step.id}.`);
    }

    ids.add(step.id);
  }

  if (challenge.mode === "single-step" && challenge.steps.length !== 1) {
    throw new Error(
      `Roll challenge ${challenge.id} single-step mode must define exactly one step.`,
    );
  }
};

export const createRollChallengeProgress = (
  challenge: RandomEventRollChallengeDefinition,
): RandomEventRollChallengeProgress => {
  validateRollChallengeDefinition(challenge);

  return {
    challengeId: challenge.id,
    mode: challenge.mode,
    nextStepIndex: 0,
    stepResults: [],
    completed: false,
    succeeded: null,
  };
};

const finalizeProgress = (
  challenge: RandomEventRollChallengeDefinition,
  stepResults: RandomEventRollChallengeStepResult[],
): Pick<RandomEventRollChallengeProgress, "completed" | "succeeded" | "nextStepIndex"> => {
  const failOnFirstMiss = challenge.failOnFirstMiss ?? true;
  const anyMiss = stepResults.some((stepResult) => !stepResult.succeeded);

  if (failOnFirstMiss && anyMiss) {
    return {
      completed: true,
      succeeded: false,
      nextStepIndex: stepResults.length,
    };
  }

  if (stepResults.length < challenge.steps.length) {
    return {
      completed: false,
      succeeded: null,
      nextStepIndex: stepResults.length,
    };
  }

  return {
    completed: true,
    succeeded: !anyMiss,
    nextStepIndex: challenge.steps.length,
  };
};

export const advanceRollChallengeStep = ({
  playerDice,
  userId,
  challenge,
  progress,
}: AdvanceRollChallengeInput): RandomEventRollChallengeProgress => {
  validateRollChallengeDefinition(challenge);

  if (progress.challengeId !== challenge.id) {
    throw new Error(
      `Progress challenge id ${progress.challengeId} does not match ${challenge.id}.`,
    );
  }

  if (progress.completed) {
    return progress;
  }

  const step = challenge.steps[progress.nextStepIndex];
  if (!step) {
    const finalState = finalizeProgress(challenge, progress.stepResults);
    return {
      ...progress,
      ...finalState,
    };
  }

  const { dieSides, rolledValue } = resolveStepRoll(playerDice, userId, step);
  const normalizedTarget = Math.max(1, Math.floor(step.target));
  const stepResult: RandomEventRollChallengeStepResult = {
    stepId: step.id,
    label: step.label,
    sourceType: step.source.type,
    dieSides,
    rolledValue,
    target: normalizedTarget,
    comparator: step.comparator,
    succeeded: evaluateComparator(rolledValue, normalizedTarget, step.comparator),
  };

  const nextStepResults = [...progress.stepResults, stepResult];
  const finalState = finalizeProgress(challenge, nextStepResults);

  return {
    ...progress,
    stepResults: nextStepResults,
    ...finalState,
  };
};

export const resolveRollChallengeImmediately = (
  playerDice: RandomEventRollChallengePlayerDice,
  userId: string,
  challenge: RandomEventRollChallengeDefinition,
): RandomEventRollChallengeProgress => {
  let progress = createRollChallengeProgress(challenge);

  while (!progress.completed) {
    progress = advanceRollChallengeStep({
      playerDice,
      userId,
      challenge,
      progress,
    });
  }

  return progress;
};
