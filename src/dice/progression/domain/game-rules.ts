import { getDiceBalanceData } from "../../../rolly-data/load";

const minuteMs = 60_000;
const maxDiceRollPassCount = 120;

const getDicePrestigeSides = (): number[] => {
  return getDiceBalanceData().prestigeSides;
};

const getBanStep = (): number => {
  return getDiceBalanceData().banStep;
};

const getDuelPunishmentBaseMs = (): number => {
  return getDiceBalanceData().pvp.loserLockoutBaseMinutes * minuteMs;
};

const getDuelRewardBaseMs = (): number => {
  return getDiceBalanceData().pvp.winnerBuffBaseMinutes * minuteMs;
};

export const getMaxDicePrestige = (): number => {
  return getDicePrestigeSides().length - 1;
};

export const getMaxDicePvpTier = (): number => {
  return getMaxDicePrestige();
};

export const getDicePvpChallengeExpireMs = (): number => {
  return getDiceBalanceData().pvp.challengeExpireMinutes * minuteMs;
};

export const getDicePrestigeBaseLevel = (): number => {
  return getDiceBalanceData().lowerPrestigeBaseLevel;
};

export const getDiceLevelUpReward = (): number => {
  return getDiceBalanceData().levelUpReward;
};

export const getDiceMaxRollPassCount = (): number => {
  return maxDiceRollPassCount;
};

export const getDiceChargeStartMs = (): number => {
  return getDiceBalanceData().charge.startAfterMinutes * minuteMs;
};

export const getDiceChargeMaxMultiplier = (): number => {
  return getDiceBalanceData().charge.maxMultiplier;
};

export const getDiceSidesForPrestige = (prestige: number): number => {
  const prestigeSides = getDicePrestigeSides();
  const normalized = Math.min(Math.max(0, Math.floor(prestige)), getMaxDicePrestige());
  return prestigeSides[normalized] ?? prestigeSides[0] ?? 6;
};

export const getUnlockedDicePvpTierFromPrestige = (prestige: number): number => {
  const normalizedPrestige = Math.max(0, Math.floor(prestige));
  return Math.min(getMaxDicePvpTier(), normalizedPrestige + 1);
};

export const getBaseRollPassCount = (prestige: number): number => {
  const normalizedPrestige = Math.max(0, Math.floor(prestige));
  return normalizedPrestige + 1;
};

export const getDoubleBuffRollPassCount = (prestige: number): number => {
  return getBaseRollPassCount(prestige) * 2;
};

export const getMaxBansPerDie = (dieSides: number): number => {
  return Math.max(0, Math.floor(dieSides) - 1);
};

export const getUnlockedBanSlotsFromFame = (
  fame: number,
  _level: number,
  _dieSides: number,
): number => {
  void _level;
  void _dieSides;
  return Math.max(0, Math.floor(fame / getBanStep()));
};

export const normalizeDicePvpTier = (duelTier: number): number => {
  return Math.min(getMaxDicePvpTier(), Math.max(1, Math.floor(duelTier)));
};

export const getDicePvpDieSidesForTier = (duelTier: number): number => {
  const normalizedTier = normalizeDicePvpTier(duelTier);
  const prestigeSides = getDicePrestigeSides();
  return prestigeSides[normalizedTier - 1] ?? prestigeSides[0] ?? 6;
};

export const getDicePvpDieLabel = (duelTier: number): string => {
  return `D${getDicePvpDieSidesForTier(duelTier)}`;
};

export const getDuelPunishmentMs = (duelTier: number): number => {
  const normalizedTier = normalizeDicePvpTier(duelTier);
  return getDuelPunishmentBaseMs() * 2 ** (normalizedTier - 1);
};

export const getDuelRewardMs = (duelTier: number): number => {
  const normalizedTier = normalizeDicePvpTier(duelTier);
  return getDuelRewardBaseMs() * 2 ** (normalizedTier - 1);
};
