import type { SqliteDatabase } from "../../../shared/db";
import { createSqliteUnitOfWork } from "../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqlitePvpRepository } from "../../pvp/infrastructure/sqlite/pvp-repository";
import {
  createDiceHostileEffectsService,
  type ApplyShieldableNegativeLockoutResult,
  type ApplyShieldableNegativeRollPenaltyResult,
} from "../application/hostile-effects-service";
import { createSqliteProgressionRepository } from "../infrastructure/sqlite/progression-repository";
import type { DiceTemporaryEffectStackMode } from "./temporary-effects";

const createHostileEffects = (db: SqliteDatabase) => {
  return createDiceHostileEffectsService({
    progression: createSqliteProgressionRepository(db),
    pvp: createSqlitePvpRepository(db),
    unitOfWork: createSqliteUnitOfWork(db),
  });
};

export type {
  ApplyShieldableNegativeLockoutResult,
  ApplyShieldableNegativeRollPenaltyResult,
};

export const applyShieldableNegativeLockout = (
  db: SqliteDatabase,
  input: {
    userId: string;
    durationMs: number;
    nowMs?: number;
  },
): ApplyShieldableNegativeLockoutResult => {
  return createHostileEffects(db).applyShieldableNegativeLockout(input);
};

export const applyShieldableNegativeRollPenalty = (
  db: SqliteDatabase,
  input: {
    userId: string;
    source: string;
    divisor: number;
    rolls: number;
    stackMode: DiceTemporaryEffectStackMode;
    nowMs?: number;
  },
): ApplyShieldableNegativeRollPenaltyResult => {
  return createHostileEffects(db).applyShieldableNegativeRollPenalty(input);
};
