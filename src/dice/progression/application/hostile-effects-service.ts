import type { UnitOfWork } from "../../../shared-kernel/application/unit-of-work";
import type { DicePvpRepository } from "../../pvp/application/ports";
import type { DiceProgressionRepository } from "./ports";

export type ApplyShieldableNegativeLockoutResult = {
  blockedByShield: boolean;
  lockoutUntilMs: number | null;
};

export type ApplyShieldableNegativeRollPenaltyResult = {
  blockedByShield: boolean;
};

export type DiceHostileEffectsService = {
  applyShieldableNegativeLockout: (input: {
    userId: string;
    durationMs: number;
    nowMs?: number;
  }) => ApplyShieldableNegativeLockoutResult;
  applyShieldableNegativeRollPenalty: (input: {
    userId: string;
    source: string;
    divisor: number;
    rolls: number;
    stackMode: "stack" | "refresh" | "replace" | "no-stack";
    nowMs?: number;
  }) => ApplyShieldableNegativeRollPenaltyResult;
};

export const createDiceHostileEffectsService = ({
  progression,
  pvp,
  unitOfWork,
}: {
  progression: Pick<
    DiceProgressionRepository,
    "applyDiceTemporaryEffect" | "consumeOldestEffectChargeByCode"
  >;
  pvp: Pick<DicePvpRepository, "getActiveDiceLockout" | "setDicePvpEffects">;
  unitOfWork: UnitOfWork;
}): DiceHostileEffectsService => {
  return {
    applyShieldableNegativeLockout: ({ userId, durationMs, nowMs = Date.now() }) =>
      unitOfWork.runInTransaction(() => {
        if (progression.consumeOldestEffectChargeByCode(userId, "negative-effect-shield", nowMs)) {
          return {
            blockedByShield: true,
            lockoutUntilMs: null,
          };
        }

        const existingLockoutUntil = pvp.getActiveDiceLockout(userId, nowMs);
        const requestedLockoutUntil = nowMs + durationMs;
        const nextLockoutUntil = Math.max(existingLockoutUntil ?? 0, requestedLockoutUntil);

        pvp.setDicePvpEffects({
          userId,
          lockoutUntil: new Date(nextLockoutUntil).toISOString(),
        });

        return {
          blockedByShield: false,
          lockoutUntilMs: nextLockoutUntil,
        };
      }),
    applyShieldableNegativeRollPenalty: ({
      userId,
      source,
      divisor,
      rolls,
      stackMode,
      nowMs = Date.now(),
    }) =>
      unitOfWork.runInTransaction(() => {
        if (progression.consumeOldestEffectChargeByCode(userId, "negative-effect-shield", nowMs)) {
          return {
            blockedByShield: true,
          };
        }

        progression.applyDiceTemporaryEffect({
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
      }),
  };
};
