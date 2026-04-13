import type { DiceAchievementId } from "../domain/achievements";
import type {
  ApplyDiceTemporaryEffectInput,
  ConsumeDiceTemporaryEffectsForRollInput,
  DiceTemporaryEffect,
  GetActiveDiceTemporaryEffectsInput,
} from "../domain/temporary-effects";

export type DiceCountUpdate = {
  userId: string;
  diceCount: number;
};

export type DiceCountByPrestigeUpdate = {
  userId: string;
  prestige: number;
  diceCount: number;
};

export type DicePrestigeUpdate = {
  userId: string;
  prestige: number;
};

export type DicePrestigeLeaderboardEntry = {
  userId: string;
  prestige: number;
  diceCount: number;
};

export type DiceBanUpdate = {
  userId: string;
  dieIndex: number;
  bannedValue: number;
};

export type DiceProgressionAchievementStats = {
  rollCommandsTotal: number;
  nearDiceCountIncreaseRollsTotal: number;
  highestChargeMultiplier: number;
  highestRollPassCount: number;
  diceCountIncreasesTotal: number;
  firstBanAt: string | null;
};

export type RecordDiceProgressionAchievementStatsInput = {
  userId: string;
  nearDiceCountIncreaseRollCount: number;
  chargeMultiplier: number;
  rollPassCount: number;
  diceCountIncreasesGained: number;
};

export type DiceProgressionRepository = {
  getDiceCount: (userId: string) => number;
  getDiceCountForPrestige: (userId: string, prestige: number) => number;
  setDiceCount: (update: DiceCountUpdate) => void;
  setDiceCountForPrestige: (update: DiceCountByPrestigeUpdate) => void;
  getDicePrestige: (userId: string) => number;
  getTopPrestigeEntries: (limit: number) => DicePrestigeLeaderboardEntry[];
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
  getLastPersonalDiceRollAt: (userId: string) => number | null;
  setLastPersonalDiceRollAt: (userId: string, nowMs: number) => void;
  purgeExpiredDiceTemporaryEffects: (nowMs?: number) => number;
  getActiveDiceTemporaryEffects: (
    input: GetActiveDiceTemporaryEffectsInput,
  ) => DiceTemporaryEffect[];
  applyDiceTemporaryEffect: (input: ApplyDiceTemporaryEffectInput) => DiceTemporaryEffect;
  consumeDiceTemporaryEffectsForRoll: (input: ConsumeDiceTemporaryEffectsForRollInput) => number;
  clearAllDiceTemporaryEffects: (userId: string) => number;
  clearNegativeDiceTemporaryEffects: (userId: string, nowMs?: number) => number;
  consumeOldestEffectChargeByCode: (userId: string, effectCode: string, nowMs?: number) => boolean;
  consumeEffectChargeById: (userId: string, effectId: string, nowMs?: number) => boolean;
};
