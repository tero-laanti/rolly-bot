import { getDiceBalanceData, getDicePvpData } from "../../../rolly-data/load";
import { minuteMs } from "../../../shared/time";

const maxDicePvpTier = 5;

const getDicePrestigeSides = (): number[] => {
  return getDiceBalanceData().prestigeSides;
};

export const getDiceBanStep = (): number => {
  return getDiceBalanceData().banStep;
};

const getDuelPunishmentBaseMs = (): number => {
  return getDicePvpData().loserLockoutBaseMinutes * minuteMs;
};

const getDuelRewardBaseMs = (): number => {
  return getDicePvpData().winnerBuffBaseMinutes * minuteMs;
};

export const getMaxDicePrestige = (): number => {
  return getDicePrestigeSides().length - 1;
};

export const getMaxDicePvpTier = (): number => {
  return Math.min(getMaxDicePrestige(), maxDicePvpTier);
};

export const getDicePvpChallengeExpireMs = (): number => {
  return getDicePvpData().challengeExpireMinutes * minuteMs;
};

export const getDicePrestigeBaseDiceCount = (): number => {
  return getDiceBalanceData().lowerPrestigeBaseDiceCount;
};

export const getDiceCountIncreaseReward = (): number => {
  return getDiceBalanceData().diceCountIncreaseReward;
};

export const getFirstDailyRollPipReward = (): number => {
  return getDiceBalanceData().firstDailyRollPipReward;
};

export const getDiceMaxRollPassCount = (): number => {
  return getDiceBalanceData().maxRollPassCount;
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

export const getDoubleBuffRollPassCount = (
  prestige: number,
  activeSourceCount: number = 1,
): number => {
  const normalizedSourceCount = Math.max(0, Math.floor(activeSourceCount));
  return getBaseRollPassCount(prestige) * 2 ** normalizedSourceCount;
};

export const getMaxBansPerDie = (dieSides: number): number => {
  return Math.max(0, Math.floor(dieSides) - 1);
};

export const getUnlockedBanSlotsFromFame = (
  fame: number,
  _diceCount: number,
  _dieSides: number,
): number => {
  void _diceCount;
  void _dieSides;
  return Math.max(0, Math.floor(fame / getDiceBanStep()));
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
