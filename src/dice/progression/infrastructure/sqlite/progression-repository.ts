import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceProgressionRepository } from "../../application/ports";
import {
  awardAchievements,
  clearUserDiceAchievements,
  getUserDiceAchievements,
} from "../../domain/achievements-store";
import {
  clearDiceBan,
  clearSingleDiceBan,
  clearUserDiceBans,
  getDiceBans,
  setDiceBan,
} from "../../domain/bans";
import { getLastDiceRollAt, setLastDiceRollAt } from "../../domain/charge";
import {
  getActiveDicePrestige,
  getDiceLevel,
  getDiceLevelForPrestige,
  getDicePrestige,
  getDiceSides,
  isOnHighestDicePrestige,
  setActiveDicePrestige,
  setDiceLevel,
  setDiceLevelForPrestige,
  setDicePrestige,
} from "../../domain/prestige";
import {
  applyDiceTemporaryEffect,
  consumeDiceTemporaryEffectsForRoll,
  getActiveDiceTemporaryEffects,
  purgeExpiredDiceTemporaryEffects,
} from "../../domain/temporary-effects";

const clearAllDiceTemporaryEffects = (db: SqliteDatabase, userId: string): number => {
  return db.prepare("DELETE FROM dice_temporary_effects WHERE user_id = ?").run(userId).changes;
};

const clearNegativeDiceTemporaryEffects = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): number => {
  const effects = getActiveDiceTemporaryEffects(db, {
    userId,
    nowMs,
  }).filter((effect) => effect.kind === "negative");
  if (effects.length < 1) {
    return 0;
  }

  for (const effect of effects) {
    db.prepare("DELETE FROM dice_temporary_effects WHERE id = ?").run(effect.id);
  }

  return effects.length;
};

const consumeOldestEffectChargeByCode = (
  db: SqliteDatabase,
  userId: string,
  effectCode: string,
  nowMs: number = Date.now(),
): boolean => {
  const effect = getActiveDiceTemporaryEffects(db, {
    userId,
    nowMs,
  }).find(
    (entry) =>
      entry.effectCode === effectCode &&
      typeof entry.remainingRolls === "number" &&
      entry.remainingRolls > 0,
  );
  if (!effect || effect.remainingRolls === null) {
    return false;
  }

  const nextRemainingRolls = effect.remainingRolls - 1;
  if (nextRemainingRolls <= 0) {
    db.prepare("DELETE FROM dice_temporary_effects WHERE id = ?").run(effect.id);
  } else {
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
  }

  return true;
};

export const createSqliteProgressionRepository = (
  db: SqliteDatabase,
): DiceProgressionRepository => {
  return {
    getDiceLevel: (userId) => getDiceLevel(db, userId),
    getDiceLevelForPrestige: (userId, prestige) => getDiceLevelForPrestige(db, userId, prestige),
    setDiceLevel: (update) => setDiceLevel(db, update),
    setDiceLevelForPrestige: (update) => setDiceLevelForPrestige(db, update),
    getDicePrestige: (userId) => getDicePrestige(db, userId),
    setDicePrestige: (update) => setDicePrestige(db, update),
    getActiveDicePrestige: (userId) => getActiveDicePrestige(db, userId),
    setActiveDicePrestige: (update) => setActiveDicePrestige(db, update),
    isOnHighestDicePrestige: (userId) => isOnHighestDicePrestige(db, userId),
    getDiceSides: (userId) => getDiceSides(db, userId),
    getDiceBans: (userId) => getDiceBans(db, userId),
    setDiceBan: (update) => setDiceBan(db, update),
    clearSingleDiceBan: (userId, dieIndex, bannedValue) =>
      clearSingleDiceBan(db, userId, dieIndex, bannedValue),
    clearDiceBan: (userId, dieIndex) => clearDiceBan(db, userId, dieIndex),
    clearUserDiceBans: (userId) => clearUserDiceBans(db, userId),
    getUserDiceAchievements: (userId) => getUserDiceAchievements(db, userId),
    awardAchievements: (userId, achievementIds) => awardAchievements(db, userId, achievementIds),
    clearUserDiceAchievements: (userId) => clearUserDiceAchievements(db, userId),
    getLastDiceRollAt: () => getLastDiceRollAt(db),
    setLastDiceRollAt: (nowMs) => setLastDiceRollAt(db, nowMs),
    purgeExpiredDiceTemporaryEffects: (nowMs) => purgeExpiredDiceTemporaryEffects(db, nowMs),
    getActiveDiceTemporaryEffects: (input) => getActiveDiceTemporaryEffects(db, input),
    applyDiceTemporaryEffect: (input) => applyDiceTemporaryEffect(db, input),
    consumeDiceTemporaryEffectsForRoll: (input) => consumeDiceTemporaryEffectsForRoll(db, input),
    clearAllDiceTemporaryEffects: (userId) => clearAllDiceTemporaryEffects(db, userId),
    clearNegativeDiceTemporaryEffects: (userId, nowMs) =>
      clearNegativeDiceTemporaryEffects(db, userId, nowMs),
    consumeOldestEffectChargeByCode: (userId, effectCode, nowMs) =>
      consumeOldestEffectChargeByCode(db, userId, effectCode, nowMs),
  };
};
