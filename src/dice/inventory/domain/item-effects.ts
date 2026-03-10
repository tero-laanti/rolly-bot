import type { SqliteDatabase } from "../../../shared/db";
import {
  applyDiceTemporaryEffect,
  getActiveDiceTemporaryEffects,
  type DiceTemporaryEffect,
} from "../../progression/domain/temporary-effects";

export type DiceItemDoubleRollStatus = {
  isActive: boolean;
  remainingUses: number;
  expiresAtMs: number | null;
};

export const grantNegativeEffectShield = (
  db: SqliteDatabase,
  {
    userId,
    source,
    charges = 1,
  }: {
    userId: string;
    source: string;
    charges?: number;
  },
): void => {
  applyDiceTemporaryEffect(db, {
    userId,
    effectCode: "negative-effect-shield",
    kind: "positive",
    source,
    magnitude: 1,
    remainingRolls: charges,
    consumeOnCommand: "none",
    stackMode: "stack",
  });
};

export const tryConsumeNegativeEffectShield = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): boolean => {
  const activeShield = getOldestActiveEffectByCode(db, userId, "negative-effect-shield", nowMs);
  if (!activeShield || activeShield.remainingRolls === null) {
    return false;
  }

  consumeEffectCharge(db, activeShield, nowMs);
  return true;
};

export const grantDoubleRollUses = (
  db: SqliteDatabase,
  {
    userId,
    source,
    uses,
  }: {
    userId: string;
    source: string;
    uses: number;
  },
): void => {
  applyDiceTemporaryEffect(db, {
    userId,
    effectCode: "double-roll",
    kind: "positive",
    source,
    magnitude: 1,
    remainingRolls: uses,
    consumeOnCommand: "none",
    stackMode: "stack",
  });
};

export const grantDoubleRollDuration = (
  db: SqliteDatabase,
  {
    userId,
    source,
    minutes,
    nowMs = Date.now(),
  }: {
    userId: string;
    source: string;
    minutes: number;
    nowMs?: number;
  },
): void => {
  applyDiceTemporaryEffect(db, {
    userId,
    effectCode: "double-roll",
    kind: "positive",
    source,
    magnitude: 1,
    expiresAt: new Date(nowMs + minutes * 60_000).toISOString(),
    consumeOnCommand: "none",
    stackMode: "stack",
  });
};

export const getItemDoubleRollStatus = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): DiceItemDoubleRollStatus => {
  const effects = getActiveDiceTemporaryEffects(db, {
    userId,
    nowMs,
  }).filter((effect) => effect.effectCode === "double-roll" && effect.kind === "positive");

  let remainingUses = 0;
  let expiresAtMs: number | null = null;

  for (const effect of effects) {
    if (typeof effect.remainingRolls === "number" && effect.remainingRolls > 0) {
      remainingUses += effect.remainingRolls;
    }

    if (effect.expiresAt) {
      const parsedMs = Date.parse(effect.expiresAt);
      if (!Number.isNaN(parsedMs)) {
        expiresAtMs = Math.max(expiresAtMs ?? 0, parsedMs);
      }
    }
  }

  return {
    isActive: effects.length > 0,
    remainingUses,
    expiresAtMs,
  };
};

export const consumeOneDoubleRollUse = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): boolean => {
  const activeUseEffect = getOldestActiveEffectByCode(db, userId, "double-roll", nowMs, {
    requireRemainingRolls: true,
  });
  if (!activeUseEffect || activeUseEffect.remainingRolls === null) {
    return false;
  }

  consumeEffectCharge(db, activeUseEffect, nowMs);
  return true;
};

export const clearAllNegativeTemporaryEffects = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): number => {
  const effects = getActiveDiceTemporaryEffects(db, {
    userId,
    nowMs,
  }).filter((entry) => entry.kind === "negative");
  if (effects.length < 1) {
    return 0;
  }

  for (const effect of effects) {
    db.prepare("DELETE FROM dice_temporary_effects WHERE id = ?").run(effect.id);
  }

  return effects.length;
};

const getOldestActiveEffectByCode = (
  db: SqliteDatabase,
  userId: string,
  effectCode: string,
  nowMs: number,
  options?: {
    requireRemainingRolls?: boolean;
  },
): DiceTemporaryEffect | null => {
  const effects = getActiveDiceTemporaryEffects(db, {
    userId,
    nowMs,
  }).filter((effect) => effect.effectCode === effectCode);

  const filteredEffects = options?.requireRemainingRolls
    ? effects.filter(
        (effect) => typeof effect.remainingRolls === "number" && effect.remainingRolls > 0,
      )
    : effects;

  return filteredEffects[0] ?? null;
};

const consumeEffectCharge = (
  db: SqliteDatabase,
  effect: DiceTemporaryEffect,
  nowMs: number,
): void => {
  if (effect.remainingRolls === null) {
    return;
  }

  const nextRemainingRolls = effect.remainingRolls - 1;
  if (nextRemainingRolls <= 0) {
    db.prepare("DELETE FROM dice_temporary_effects WHERE id = ?").run(effect.id);
    return;
  }

  db.prepare(
    `
    UPDATE dice_temporary_effects
    SET remaining_rolls = @remainingRolls, updated_at = @updatedAt
    WHERE id = @id
  `,
  ).run({
    id: effect.id,
    remainingRolls: nextRemainingRolls,
    updatedAt: new Date(nowMs).toISOString(),
  });
};
