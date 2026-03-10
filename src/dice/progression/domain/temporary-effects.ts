export type DiceTemporaryEffectKind = "positive" | "negative";
export type DiceTemporaryEffectStackMode = "stack" | "refresh" | "replace" | "no-stack";
export type DiceTemporaryEffectConsumeOnCommand = "dice" | "any" | "none";

export type DiceTemporaryEffect = {
  id: string;
  userId: string;
  effectCode: string;
  kind: DiceTemporaryEffectKind;
  source: string;
  magnitude: number;
  remainingRolls: number | null;
  expiresAt: string | null;
  consumeOnCommand: DiceTemporaryEffectConsumeOnCommand;
  stackGroup: string;
  createdAt: string;
  updatedAt: string;
};

export type ApplyDiceTemporaryEffectInput = {
  userId: string;
  effectCode: string;
  kind: DiceTemporaryEffectKind;
  source: string;
  magnitude?: number;
  remainingRolls?: number | null;
  expiresAt?: string | null;
  consumeOnCommand?: DiceTemporaryEffectConsumeOnCommand;
  stackGroup?: string;
  stackMode?: DiceTemporaryEffectStackMode;
};

export type GetActiveDiceTemporaryEffectsInput = {
  userId: string;
  nowMs?: number;
  commandName?: string;
};

export type ConsumeDiceTemporaryEffectsForRollInput = {
  userId: string;
  commandName: string;
  rollsConsumed?: number;
  nowMs?: number;
  effectCodes?: string[];
};

export type DiceTemporaryEffectsRollSummary = {
  multiplier: number;
  divisor: number;
  effectiveFactor: number;
  hasApplicableEffects: boolean;
  hasPositiveRollEffects: boolean;
  hasNegativeRollEffects: boolean;
};
