import type { SqliteDatabase } from "../../../shared/db";
import {
  createDiceItemEffectsService,
  type DiceItemDoubleRollStatus,
} from "../application/item-effects-service";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";

const createItemEffectsService = (db: SqliteDatabase) => {
  return createDiceItemEffectsService(createSqliteProgressionRepository(db));
};

export type { DiceItemDoubleRollStatus };

export const grantNegativeEffectShield = (
  db: SqliteDatabase,
  input: {
    userId: string;
    source: string;
    charges?: number;
  },
): void => {
  createItemEffectsService(db).grantNegativeEffectShield(input);
};

export const tryConsumeNegativeEffectShield = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): boolean => {
  return createSqliteProgressionRepository(db).consumeOldestEffectChargeByCode(
    userId,
    "negative-effect-shield",
    nowMs,
  );
};

export const grantDoubleRollUses = (
  db: SqliteDatabase,
  input: {
    userId: string;
    source: string;
    uses: number;
  },
): void => {
  createItemEffectsService(db).grantDoubleRollUses(input);
};

export const grantDoubleRollDuration = (
  db: SqliteDatabase,
  input: {
    userId: string;
    source: string;
    minutes: number;
    nowMs?: number;
  },
): void => {
  createItemEffectsService(db).grantDoubleRollDuration(input);
};

export const getItemDoubleRollStatus = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): DiceItemDoubleRollStatus => {
  return createItemEffectsService(db).getItemDoubleRollStatus(userId, nowMs);
};

export const consumeOneDoubleRollUse = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): boolean => {
  return createItemEffectsService(db).consumeOneDoubleRollUse(userId, nowMs);
};

export const clearAllNegativeTemporaryEffects = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): number => {
  return createItemEffectsService(db).clearAllNegativeTemporaryEffects(userId, nowMs);
};
