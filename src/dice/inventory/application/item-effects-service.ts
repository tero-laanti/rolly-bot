import type { DiceProgressionRepository } from "../../progression/application/ports";

export type DiceItemDoubleRollStatus = {
  isActive: boolean;
  remainingUses: number;
  expiresAtMs: number | null;
};

export type DiceItemEffectsService = {
  getItemDoubleRollStatus: (userId: string, nowMs?: number) => DiceItemDoubleRollStatus;
  consumeOneDoubleRollUse: (userId: string, nowMs?: number) => boolean;
  grantNegativeEffectShield: (input: {
    userId: string;
    source: string;
    charges?: number;
  }) => void;
  grantDoubleRollUses: (input: {
    userId: string;
    source: string;
    uses: number;
  }) => void;
  grantDoubleRollDuration: (input: {
    userId: string;
    source: string;
    minutes: number;
    nowMs?: number;
  }) => void;
  clearAllNegativeTemporaryEffects: (userId: string, nowMs?: number) => number;
};

export const createDiceItemEffectsService = (
  progression: Pick<
    DiceProgressionRepository,
    | "applyDiceTemporaryEffect"
    | "clearNegativeDiceTemporaryEffects"
    | "consumeOldestEffectChargeByCode"
    | "getActiveDiceTemporaryEffects"
  >,
): DiceItemEffectsService => {
  return {
    getItemDoubleRollStatus: (userId, nowMs = Date.now()) => {
      const effects = progression
        .getActiveDiceTemporaryEffects({
          userId,
          nowMs,
        })
        .filter((effect) => effect.effectCode === "double-roll" && effect.kind === "positive");

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
    },
    consumeOneDoubleRollUse: (userId, nowMs = Date.now()) =>
      progression.consumeOldestEffectChargeByCode(userId, "double-roll", nowMs),
    grantNegativeEffectShield: ({ userId, source, charges = 1 }) => {
      progression.applyDiceTemporaryEffect({
        userId,
        effectCode: "negative-effect-shield",
        kind: "positive",
        source,
        magnitude: 1,
        remainingRolls: charges,
        consumeOnCommand: "none",
        stackMode: "stack",
      });
    },
    grantDoubleRollUses: ({ userId, source, uses }) => {
      progression.applyDiceTemporaryEffect({
        userId,
        effectCode: "double-roll",
        kind: "positive",
        source,
        magnitude: 1,
        remainingRolls: uses,
        consumeOnCommand: "none",
        stackMode: "stack",
      });
    },
    grantDoubleRollDuration: ({ userId, source, minutes, nowMs = Date.now() }) => {
      progression.applyDiceTemporaryEffect({
        userId,
        effectCode: "double-roll",
        kind: "positive",
        source,
        magnitude: 1,
        expiresAt: new Date(nowMs + minutes * 60_000).toISOString(),
        consumeOnCommand: "none",
        stackMode: "stack",
      });
    },
    clearAllNegativeTemporaryEffects: (userId, nowMs = Date.now()) =>
      progression.clearNegativeDiceTemporaryEffects(userId, nowMs),
  };
};
