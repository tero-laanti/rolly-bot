import type { DicePersonalChargeBonus } from "../../inventory/application/ports";
import type { DiceItemDoubleRollStatus } from "../../inventory/application/item-effects-service";
import {
  combineDiceChargeMultipliers,
  getDiceChargeMultiplier,
  getPersonalDiceChargeMultiplier,
} from "../domain/charge";
import {
  getBaseRollPassCount,
  getDiceMaxRollPassCount,
  getDoubleBuffRollPassCount,
} from "../domain/game-rules";
import type {
  DiceTemporaryEffect,
  DiceTemporaryEffectsRollSummary,
} from "../domain/temporary-effects";

export type DiceRollModifierState = {
  rollPassCount: number;
  didUseChargeRoll: boolean;
  effectiveFactor: number;
  hasActivePvpDoubleRoll: boolean;
  hasActiveItemDoubleRoll: boolean;
  hasActiveDoubleRollRush: boolean;
  globalChargeMultiplier: number;
  personalChargeMultiplier: number;
  combinedChargeMultiplier: number;
  itemDoubleRollStatus: DiceItemDoubleRollStatus;
  temporaryEffectsRollSummary: DiceTemporaryEffectsRollSummary;
};

export const summarizeDiceTemporaryRollEffects = (
  effects: DiceTemporaryEffect[],
): DiceTemporaryEffectsRollSummary => {
  let multiplier = 1;
  let divisor = 1;
  let hasApplicableEffects = false;
  let hasPositiveRollEffects = false;
  let hasNegativeRollEffects = false;

  for (const effect of effects) {
    if (effect.effectCode === "roll-pass-multiplier" && effect.kind === "positive") {
      multiplier *= Math.max(1, effect.magnitude);
      hasApplicableEffects = true;
      hasPositiveRollEffects = true;
      continue;
    }

    if (effect.effectCode === "roll-pass-divisor" && effect.kind === "negative") {
      divisor *= Math.max(1, effect.magnitude);
      hasApplicableEffects = true;
      hasNegativeRollEffects = true;
    }
  }

  const normalizedMultiplier = Math.max(1, Math.floor(multiplier));
  const normalizedDivisor = Math.max(1, Math.floor(divisor));

  return {
    multiplier: normalizedMultiplier,
    divisor: normalizedDivisor,
    effectiveFactor: normalizedMultiplier / normalizedDivisor,
    hasApplicableEffects,
    hasPositiveRollEffects,
    hasNegativeRollEffects,
  };
};

export const createDiceRollModifierState = ({
  prestige,
  lastGlobalRollAtMs,
  lastPersonalRollAtMs,
  personalChargeBonus,
  pvpDoubleRollUntilMs,
  itemDoubleRollStatus,
  hasActiveDoubleRollRush,
  temporaryEffects,
  nowMs = Date.now(),
}: {
  prestige: number;
  lastGlobalRollAtMs: number | null;
  lastPersonalRollAtMs: number | null;
  personalChargeBonus: DicePersonalChargeBonus;
  pvpDoubleRollUntilMs: number | null;
  itemDoubleRollStatus: DiceItemDoubleRollStatus;
  hasActiveDoubleRollRush: boolean;
  temporaryEffects: DiceTemporaryEffect[];
  nowMs?: number;
}): DiceRollModifierState => {
  const baseRollPassCount = getBaseRollPassCount(prestige);
  const globalChargeMultiplier = getDiceChargeMultiplier(lastGlobalRollAtMs, nowMs);
  const personalChargeMultiplier = personalChargeBonus.unlocked
    ? getPersonalDiceChargeMultiplier(lastPersonalRollAtMs, personalChargeBonus, nowMs)
    : 1;
  const combinedChargeMultiplier = combineDiceChargeMultipliers(
    globalChargeMultiplier,
    personalChargeMultiplier,
  );
  const hasActivePvpDoubleRoll = Boolean(
    pvpDoubleRollUntilMs !== null && pvpDoubleRollUntilMs > nowMs,
  );
  const hasActiveItemDoubleRoll = itemDoubleRollStatus.isActive;
  const hasActiveDoubleRoll =
    hasActivePvpDoubleRoll || hasActiveItemDoubleRoll || hasActiveDoubleRollRush;
  const doubleBuffRollPassCount = hasActiveDoubleRoll
    ? getDoubleBuffRollPassCount(prestige)
    : baseRollPassCount;
  const temporaryEffectsRollSummary = summarizeDiceTemporaryRollEffects(temporaryEffects);
  const nonChargeRollPassCount = Math.max(
    1,
    Math.floor(doubleBuffRollPassCount * temporaryEffectsRollSummary.effectiveFactor),
  );
  const didUseChargeRoll = combinedChargeMultiplier > 1;
  const winningRollPassCount = didUseChargeRoll
    ? baseRollPassCount * combinedChargeMultiplier
    : nonChargeRollPassCount;
  const rollPassCount = Math.max(1, Math.min(getDiceMaxRollPassCount(), winningRollPassCount));

  return {
    rollPassCount,
    didUseChargeRoll,
    effectiveFactor: rollPassCount / baseRollPassCount,
    hasActivePvpDoubleRoll,
    hasActiveItemDoubleRoll,
    hasActiveDoubleRollRush,
    globalChargeMultiplier,
    personalChargeMultiplier,
    combinedChargeMultiplier,
    itemDoubleRollStatus,
    temporaryEffectsRollSummary,
  };
};

export const buildDiceRollModifierFooter = ({
  hasActivePvpDoubleRoll,
  hasActiveItemDoubleRoll,
  hasActiveDoubleRollRush,
  temporaryEffectsRollSummary,
  didUseChargeRoll,
  effectiveFactor,
}: DiceRollModifierState): string => {
  const modifierParts: string[] = [];

  if (hasActivePvpDoubleRoll || hasActiveItemDoubleRoll || hasActiveDoubleRollRush) {
    const doubleRollSources: string[] = [];
    if (hasActivePvpDoubleRoll) {
      doubleRollSources.push("PvP");
    }
    if (hasActiveItemDoubleRoll) {
      doubleRollSources.push("item");
    }
    if (hasActiveDoubleRollRush) {
      doubleRollSources.push("Rush");
    }

    modifierParts.push(
      doubleRollSources.length === 1
        ? `${doubleRollSources[0]} double ×2`
        : `double-roll buff ×2 (${doubleRollSources.join(" + ")})`,
    );
  }

  if (temporaryEffectsRollSummary.multiplier > 1) {
    modifierParts.push(
      `temporary ${temporaryEffectsRollSummary.multiplier === 2 ? "buff" : "buffs"} ×${temporaryEffectsRollSummary.multiplier}`,
    );
  }

  if (temporaryEffectsRollSummary.divisor > 1) {
    modifierParts.push(
      `temporary ${temporaryEffectsRollSummary.divisor === 2 ? "penalty" : "penalties"} ÷${temporaryEffectsRollSummary.divisor}`,
    );
  }

  if (modifierParts.length < 1) {
    return "";
  }

  if (didUseChargeRoll) {
    return `Other active roll modifiers: ${modifierParts.join(" · ")}.`;
  }

  return `Roll modifiers: ${modifierParts.join(" · ")} → effective ×${formatMultiplierFactor(effectiveFactor)}.`;
};

export const formatMultiplierFactor = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "1";
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value
    .toFixed(2)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
};
