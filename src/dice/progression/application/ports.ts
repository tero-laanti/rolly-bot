import type { DiceAchievementId } from "../domain/achievements";
import type {
  ApplyDiceTemporaryEffectInput,
  ConsumeDiceTemporaryEffectsForRollInput,
  DiceTemporaryEffect,
  GetActiveDiceTemporaryEffectsInput,
} from "../domain/temporary-effects";

export type DiceLevelUpdate = {
  userId: string;
  level: number;
};

export type DiceLevelByPrestigeUpdate = {
  userId: string;
  prestige: number;
  level: number;
};

export type DicePrestigeUpdate = {
  userId: string;
  prestige: number;
};

export type DiceBanUpdate = {
  userId: string;
  dieIndex: number;
  bannedValue: number;
};

export type DiceProgressionAchievementStats = {
  rollCommandsTotal: number;
  nearLevelupRollsTotal: number;
  highestChargeMultiplier: number;
  highestRollPassCount: number;
  levelUpsTotal: number;
  firstBanAt: string | null;
};

export type RecordDiceProgressionAchievementStatsInput = {
  userId: string;
  nearLevelupRollCount: number;
  chargeMultiplier: number;
  rollPassCount: number;
  levelUpsGained: number;
};

export type DiceProgressionRepository = {
  getDiceLevel: (userId: string) => number;
  getDiceLevelForPrestige: (userId: string, prestige: number) => number;
  setDiceLevel: (update: DiceLevelUpdate) => void;
  setDiceLevelForPrestige: (update: DiceLevelByPrestigeUpdate) => void;
  getDicePrestige: (userId: string) => number;
  setDicePrestige: (update: DicePrestigeUpdate) => void;
  getActiveDicePrestige: (userId: string) => number;
  setActiveDicePrestige: (update: DicePrestigeUpdate) => void;
  isOnHighestDicePrestige: (userId: string) => boolean;
  getDiceSides: (userId: string) => number;
  getDiceBans: (userId: string) => Map<number, Set<number>>;
  setDiceBan: (update: DiceBanUpdate) => void;
  clearSingleDiceBan: (userId: string, dieIndex: number, bannedValue: number) => void;
  clearDiceBan: (userId: string, dieIndex: number) => void;
  clearUserDiceBans: (userId: string) => void;
  getUserDiceAchievements: (userId: string) => DiceAchievementId[];
  awardAchievements: (userId: string, achievementIds: DiceAchievementId[]) => DiceAchievementId[];
  clearUserDiceAchievements: (userId: string) => void;
  getDiceProgressionAchievementStats: (userId: string) => DiceProgressionAchievementStats;
  recordDiceProgressionAchievementStats: (
    input: RecordDiceProgressionAchievementStatsInput,
  ) => DiceProgressionAchievementStats;
  markFirstDiceBan: (userId: string) => boolean;
  getLastDiceRollAt: () => number | null;
  setLastDiceRollAt: (nowMs: number) => void;
  purgeExpiredDiceTemporaryEffects: (nowMs?: number) => number;
  getActiveDiceTemporaryEffects: (
    input: GetActiveDiceTemporaryEffectsInput,
  ) => DiceTemporaryEffect[];
  applyDiceTemporaryEffect: (input: ApplyDiceTemporaryEffectInput) => DiceTemporaryEffect;
  consumeDiceTemporaryEffectsForRoll: (input: ConsumeDiceTemporaryEffectsForRollInput) => number;
  clearAllDiceTemporaryEffects: (userId: string) => number;
  clearNegativeDiceTemporaryEffects: (userId: string, nowMs?: number) => number;
  consumeOldestEffectChargeByCode: (userId: string, effectCode: string, nowMs?: number) => boolean;
};
