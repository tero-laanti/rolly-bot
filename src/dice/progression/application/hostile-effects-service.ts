import type { UnitOfWork } from "../../../shared-kernel/application/unit-of-work";
import { hourMs } from "../../../shared/time";
import type { DicePvpRepository } from "../../pvp/application/ports";
import type { DiceTemporaryEffect } from "../domain/temporary-effects";
import type { DiceProgressionRepository } from "./ports";

export type ApplyShieldableNegativeLockoutResult = {
  blockedByShield: boolean;
  applied: boolean;
  lockoutUntilMs: number | null;
  shieldReductionMs?: number;
};

export type ApplyShieldableNegativeRollPenaltyResult = {
  blockedByShield: boolean;
  applied: boolean;
};

const didTemporaryEffectGameplayStateChange = (
  previousEffect: DiceTemporaryEffect | null,
  nextEffect: DiceTemporaryEffect,
): boolean => {
  if (!previousEffect) {
    return true;
  }

  return (
    previousEffect.id !== nextEffect.id ||
    previousEffect.effectCode !== nextEffect.effectCode ||
    previousEffect.kind !== nextEffect.kind ||
    previousEffect.magnitude !== nextEffect.magnitude ||
    previousEffect.remainingRolls !== nextEffect.remainingRolls ||
    previousEffect.expiresAt !== nextEffect.expiresAt ||
    previousEffect.consumeOnCommand !== nextEffect.consumeOnCommand ||
    previousEffect.stackGroup !== nextEffect.stackGroup
  );
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
    "applyDiceTemporaryEffect" | "consumeOldestEffectChargeByCode" | "getActiveDiceTemporaryEffects"
  >;
  pvp: Pick<DicePvpRepository, "getActiveDiceLockout" | "setDicePvpEffects">;
  unitOfWork: UnitOfWork;
}): DiceHostileEffectsService => {
  return {
    applyShieldableNegativeLockout: ({ userId, durationMs, nowMs = Date.now() }) =>
      unitOfWork.runInTransaction(() => {
        const shieldConsumed = progression.consumeOldestEffectChargeByCode(
          userId,
          "negative-effect-shield",
          nowMs,
        );
        const existingLockoutUntil = pvp.getActiveDiceLockout(userId, nowMs);
        const shieldReductionMs = shieldConsumed ? Math.min(hourMs, durationMs) : 0;
        const reducedDurationMs = Math.max(0, durationMs - shieldReductionMs);
        const requestedLockoutUntil = nowMs + reducedDurationMs;
        const nextLockoutUntil = Math.max(existingLockoutUntil ?? 0, requestedLockoutUntil);
        const applied = reducedDurationMs > 0 && nextLockoutUntil > (existingLockoutUntil ?? 0);

        if (applied) {
          pvp.setDicePvpEffects({
            userId,
            lockoutUntil: new Date(nextLockoutUntil).toISOString(),
          });
        }

        return {
          blockedByShield: shieldConsumed && !applied,
          applied,
          lockoutUntilMs: nextLockoutUntil > nowMs ? nextLockoutUntil : null,
          shieldReductionMs: shieldReductionMs > 0 ? shieldReductionMs : undefined,
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
            applied: false,
          };
        }

        const existingPenaltyEffect =
          progression
            .getActiveDiceTemporaryEffects({
              userId,
              nowMs,
              commandName: "dice",
            })
            .find(
              (effect) => effect.kind === "negative" && effect.stackGroup === "roll-pass-divisor",
            ) ?? null;
        const appliedEffect = progression.applyDiceTemporaryEffect({
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
          applied: didTemporaryEffectGameplayStateChange(existingPenaltyEffect, appliedEffect),
        };
      }),
  };
};
