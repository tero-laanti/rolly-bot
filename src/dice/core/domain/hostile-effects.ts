import type { SqliteDatabase } from "../../../shared/db";
import { getActiveDiceLockout, setDicePvpEffects } from "./pvp";
import { tryConsumeNegativeEffectShield } from "./item-effects";
import { applyDiceTemporaryEffect, type DiceTemporaryEffectStackMode } from "./temporary-effects";

export type ApplyShieldableNegativeLockoutResult = {
  blockedByShield: boolean;
  lockoutUntilMs: number | null;
};

export type ApplyShieldableNegativeRollPenaltyResult = {
  blockedByShield: boolean;
};

export const applyShieldableNegativeLockout = (
  db: SqliteDatabase,
  {
    userId,
    durationMs,
    nowMs = Date.now(),
  }: {
    userId: string;
    durationMs: number;
    nowMs?: number;
  },
): ApplyShieldableNegativeLockoutResult => {
  return db.transaction(() => {
    if (tryConsumeNegativeEffectShield(db, userId, nowMs)) {
      return {
        blockedByShield: true,
        lockoutUntilMs: null,
      };
    }

    const existingLockoutUntil = getActiveDiceLockout(db, userId, nowMs);
    const requestedLockoutUntil = nowMs + durationMs;
    const nextLockoutUntil = Math.max(existingLockoutUntil ?? 0, requestedLockoutUntil);

    setDicePvpEffects(db, {
      userId,
      lockoutUntil: new Date(nextLockoutUntil).toISOString(),
    });

    return {
      blockedByShield: false,
      lockoutUntilMs: nextLockoutUntil,
    };
  })();
};

export const applyShieldableNegativeRollPenalty = (
  db: SqliteDatabase,
  {
    userId,
    source,
    divisor,
    rolls,
    stackMode,
    nowMs = Date.now(),
  }: {
    userId: string;
    source: string;
    divisor: number;
    rolls: number;
    stackMode: DiceTemporaryEffectStackMode;
    nowMs?: number;
  },
): ApplyShieldableNegativeRollPenaltyResult => {
  return db.transaction(() => {
    if (tryConsumeNegativeEffectShield(db, userId, nowMs)) {
      return {
        blockedByShield: true,
      };
    }

    applyDiceTemporaryEffect(db, {
      userId,
      effectCode: "roll-pass-divisor",
      kind: "negative",
      source,
      magnitude: divisor,
      remainingRolls: rolls,
      consumeOnCommand: "dice",
      stackGroup: "roll-pass-divisor",
      stackMode,
    });

    return {
      blockedByShield: false,
    };
  })();
};
