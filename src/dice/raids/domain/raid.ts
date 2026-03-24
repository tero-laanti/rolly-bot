import { getDiceRaidData } from "../../../rolly-data/load";

export type RaidRewardDefinition = {
  pips: number;
  rollPassMultiplier: number;
  rollPassRolls: number;
};

export type RaidBossDefinition = {
  name: string;
  level: number;
  maxHp: number;
  reward: RaidRewardDefinition;
};

const getRaidBalance = () => {
  return getDiceRaidData();
};

const clampBossLevel = (value: number): number => {
  const { maxBossLevel } = getRaidBalance().bossBalance;
  return Math.max(1, Math.min(maxBossLevel, Math.round(value)));
};

const getBossLevelWeightRatio = (): number => {
  const { levelHalfLifeLevels } = getRaidBalance().bossBalance;
  return Math.pow(0.5, 1 / levelHalfLifeLevels);
};

export const rollRaidBossLevel = (random: () => number = Math.random): number => {
  const { maxBossLevel } = getRaidBalance().bossBalance;
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

export const calculateRaidBossMaxHp = (bossLevel: number): number => {
  const normalizedBossLevel = clampBossLevel(bossLevel);
  const { baseHp, hpIncreasePerBossLevelPercent } = getRaidBalance().bossBalance;
  const hpMultiplier = (1 + hpIncreasePerBossLevelPercent / 100) ** (normalizedBossLevel - 1);
  return Math.max(1, Math.round(baseHp * hpMultiplier));
};

const pickBossName = (random: () => number): string => {
  const { prefixes, suffixes } = getRaidBalance().bossNames;
  const prefix = prefixes[Math.floor(random() * prefixes.length)] ?? prefixes[0];
  const suffix = suffixes[Math.floor(random() * suffixes.length)] ?? suffixes[0];
  return `${prefix} ${suffix}`;
};

const resolveRaidRewardPips = (bossLevel: number): number => {
  const reward = getRaidBalance().reward;

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

const resolveRaidRewardRollPassMultiplier = (bossLevel: number): number => {
  const { rollPassBuff } = getRaidBalance().reward;
  const scaledMultiplier = Math.round(bossLevel * rollPassBuff.multiplierPerBossLevel);
  return Math.max(
    rollPassBuff.minimumMultiplier,
    Math.min(rollPassBuff.maximumMultiplier, scaledMultiplier),
  );
};

const resolveRaidRewardRollPassRolls = (bossLevel: number): number => {
  const { rollPassBuff } = getRaidBalance().reward;
  const scaledRolls = Math.ceil(bossLevel / rollPassBuff.rollsPerBossLevelDivisor);
  return Math.max(rollPassBuff.minimumRolls, Math.min(rollPassBuff.maximumRolls, scaledRolls));
};

export const getDefaultRaidReward = (bossLevel: number): RaidRewardDefinition => {
  return {
    pips: resolveRaidRewardPips(bossLevel),
    rollPassMultiplier: resolveRaidRewardRollPassMultiplier(bossLevel),
    rollPassRolls: resolveRaidRewardRollPassRolls(bossLevel),
  };
};

export const describeRaidReward = (reward: RaidRewardDefinition): string => {
  const pipText = `${reward.pips} pip${reward.pips === 1 ? "" : "s"}`;
  const rollBuffText = `x${reward.rollPassMultiplier} roll buff for the next ${reward.rollPassRolls} /roll${reward.rollPassRolls === 1 ? "" : "s"}`;
  return `${pipText} and ${rollBuffText} per eligible raider`;
};

export const createRaidBoss = ({
  random = Math.random,
}: {
  random?: () => number;
} = {}): RaidBossDefinition => {
  const level = rollRaidBossLevel(random);
  const reward = getDefaultRaidReward(level);

  return {
    name: pickBossName(random),
    level,
    maxHp: calculateRaidBossMaxHp(level),
    reward,
  };
};
