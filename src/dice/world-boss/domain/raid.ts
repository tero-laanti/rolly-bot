import { getWorldBossData } from "../../../rolly-data/load";
import { getDiceSidesForPrestige } from "../../progression/domain/game-rules";

export type WorldBossRewardDefinition = {
  pips: number;
  rollPassMultiplier: number;
  rollPassRolls: number;
};

export type WorldBossDefinition = {
  name: string;
  level: number;
  maxHp: number;
  reward: WorldBossRewardDefinition;
};

const getWorldBossBalance = () => {
  return getWorldBossData();
};

export const calculateWorldBossParticipantStrength = (prestige: number): number => {
  const baseDieSides = getDiceSidesForPrestige(0);
  const dieSides = getDiceSidesForPrestige(prestige);
  return (dieSides + 1) / (baseDieSides + 1);
};

const clampBossLevel = (value: number): number => {
  const { maxBossLevel } = getWorldBossBalance().bossBalance;
  return Math.max(1, Math.min(maxBossLevel, Math.round(value)));
};

const getBossLevelWeightRatio = (): number => {
  const { levelHalfLifeLevels } = getWorldBossBalance().bossBalance;
  return Math.pow(0.5, 1 / levelHalfLifeLevels);
};

export const rollWorldBossLevel = (random: () => number = Math.random): number => {
  const { maxBossLevel } = getWorldBossBalance().bossBalance;
  if (maxBossLevel <= 1) {
    return 1;
  }

  const weightRatio = getBossLevelWeightRatio();
  const totalWeight =
    weightRatio === 1 ? maxBossLevel : (1 - weightRatio ** maxBossLevel) / (1 - weightRatio);
  const target = Math.min(Math.max(0, random()), 0.999999999999) * totalWeight;
  let cumulativeWeight = 0;

  for (let level = 1; level <= maxBossLevel; level += 1) {
    cumulativeWeight += weightRatio ** (level - 1);
    if (target < cumulativeWeight) {
      return level;
    }
  }

  return maxBossLevel;
};

export const calculateWorldBossMaxHp = (bossLevel: number): number => {
  return calculateWorldBossMaxHpForStrength(bossLevel, 1);
};

export const calculateWorldBossMaxHpForStrength = (
  bossLevel: number,
  raiderStrength: number,
): number => {
  const normalizedBossLevel = clampBossLevel(bossLevel);
  const { baseHp, hpIncreasePerBossLevelPercent } = getWorldBossBalance().bossBalance;
  const hpMultiplier = (1 + hpIncreasePerBossLevelPercent / 100) ** (normalizedBossLevel - 1);
  const baseLevelHp = Math.max(1, Math.round(baseHp * hpMultiplier));
  const normalizedRaiderStrength = Math.max(1, raiderStrength);
  return Math.max(1, Math.round(baseLevelHp * normalizedRaiderStrength));
};

const pickBossName = (random: () => number): string => {
  const { prefixes, suffixes } = getWorldBossBalance().bossNames;
  const prefix = prefixes[Math.floor(random() * prefixes.length)] ?? prefixes[0];
  const suffix = suffixes[Math.floor(random() * suffixes.length)] ?? suffixes[0];
  return `${prefix} ${suffix}`;
};

const resolveWorldBossRewardPips = (bossLevel: number): number => {
  const reward = getWorldBossBalance().reward;

  if ("pipsFormula" in reward) {
    const { flatPips, flatPipsThroughBossLevel } = reward.pipsFormula;
    return bossLevel <= flatPipsThroughBossLevel ? flatPips : bossLevel;
  }

  let matchedTier = reward.pipsByBossLevel[0];

  for (const rewardTier of reward.pipsByBossLevel) {
    if (rewardTier.bossLevelAtLeast > bossLevel) {
      break;
    }

    matchedTier = rewardTier;
  }

  return matchedTier?.pips ?? 0;
};

const resolveWorldBossRewardRollPassMultiplier = (bossLevel: number): number => {
  const { rollPassBuff } = getWorldBossBalance().reward;
  const scaledMultiplier = Math.round(bossLevel * rollPassBuff.multiplierPerBossLevel);
  return Math.max(
    rollPassBuff.minimumMultiplier,
    Math.min(rollPassBuff.maximumMultiplier, scaledMultiplier),
  );
};

const resolveWorldBossRewardRollPassRolls = (bossLevel: number): number => {
  const { rollPassBuff } = getWorldBossBalance().reward;

  if ("rollsByBossLevel" in rollPassBuff) {
    let matchedTier = rollPassBuff.rollsByBossLevel[0];

    for (const rewardTier of rollPassBuff.rollsByBossLevel) {
      if (rewardTier.bossLevelAtLeast > bossLevel) {
        break;
      }

      matchedTier = rewardTier;
    }

    return matchedTier?.rolls ?? 1;
  }

  const scaledRolls = Math.ceil(bossLevel / rollPassBuff.rollsPerBossLevelDivisor);
  return Math.max(rollPassBuff.minimumRolls, Math.min(rollPassBuff.maximumRolls, scaledRolls));
};

export const getDefaultWorldBossReward = (bossLevel: number): WorldBossRewardDefinition => {
  return {
    pips: resolveWorldBossRewardPips(bossLevel),
    rollPassMultiplier: resolveWorldBossRewardRollPassMultiplier(bossLevel),
    rollPassRolls: resolveWorldBossRewardRollPassRolls(bossLevel),
  };
};

const buildWorldBossRewardSummary = (
  reward: WorldBossRewardDefinition,
  pipText: string,
): string => {
  const rollBuffText = `x${reward.rollPassMultiplier} roll buff for the next ${reward.rollPassRolls} /roll${reward.rollPassRolls === 1 ? "" : "s"}`;
  return `${pipText} and ${rollBuffText} per eligible player`;
};

export const describeWorldBossReward = (reward: WorldBossRewardDefinition): string => {
  const pipText = `${reward.pips} pip${reward.pips === 1 ? "" : "s"}`;
  return buildWorldBossRewardSummary(reward, pipText);
};

export const describeAppliedWorldBossReward = (
  reward: WorldBossRewardDefinition,
  awardedPipAmounts: readonly number[],
): string => {
  const normalizedAwardedPips = awardedPipAmounts
    .map((amount) => Math.max(0, Math.floor(amount)))
    .filter((amount) => amount > 0);
  if (normalizedAwardedPips.length < 1) {
    return describeWorldBossReward(reward);
  }

  const minimumAwardedPips = Math.min(...normalizedAwardedPips);
  const maximumAwardedPips = Math.max(...normalizedAwardedPips);
  if (minimumAwardedPips === maximumAwardedPips) {
    const pipText = `${minimumAwardedPips} pip${minimumAwardedPips === 1 ? "" : "s"}`;
    return buildWorldBossRewardSummary(reward, pipText);
  }

  return buildWorldBossRewardSummary(
    reward,
    `${minimumAwardedPips}-${maximumAwardedPips} pips, based on permanent bonuses`,
  );
};

export const createWorldBoss = ({
  random = Math.random,
  raiderStrength = 1,
}: {
  random?: () => number;
  raiderStrength?: number;
} = {}): WorldBossDefinition => {
  const level = rollWorldBossLevel(random);
  const reward = getDefaultWorldBossReward(level);

  return {
    name: pickBossName(random),
    level,
    maxHp: calculateWorldBossMaxHpForStrength(level, raiderStrength),
    reward,
  };
};
