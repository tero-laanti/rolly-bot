import { getDiceRaidData } from "../../../rolly-data/load";
import { getBaseRollPassCount } from "../../progression/domain/game-rules";
import { minuteMs } from "../../../shared/time";

export type RaidParticipantProfile = {
  userId: string;
  level: number;
  prestige: number;
  dieSides: number;
};

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

const getExpectedDamagePerRoll = (participant: RaidParticipantProfile): number => {
  const normalizedLevel = Math.max(1, Math.floor(participant.level));
  const normalizedSides = Math.max(2, Math.floor(participant.dieSides));
  const normalizedPrestige = Math.max(0, Math.floor(participant.prestige));
  const passCount = getBaseRollPassCount(normalizedPrestige);
  return normalizedLevel * ((normalizedSides + 1) / 2) * passCount;
};

const clampBossLevel = (value: number): number => {
  const { maxBossLevel } = getRaidBalance().bossBalance;
  return Math.max(1, Math.min(maxBossLevel, Math.round(value)));
};

const calculateBossLevel = (participantProfiles: readonly RaidParticipantProfile[]): number => {
  if (participantProfiles.length < 1) {
    return 1;
  }

  const { participantPrestigeWeight, participantExtraSidesDivisor, baselineDieSides } =
    getRaidBalance().bossBalance;
  const weightedLevelSum = participantProfiles.reduce((total, participant) => {
    const sideBonus = Math.max(
      0,
      (participant.dieSides - baselineDieSides) / participantExtraSidesDivisor,
    );
    return total + participant.level + participant.prestige * participantPrestigeWeight + sideBonus;
  }, 0);

  return clampBossLevel(weightedLevelSum / participantProfiles.length);
};

const calculateBossMaxHp = ({
  participantProfiles,
  bossLevel,
  activeDurationMs,
}: {
  participantProfiles: readonly RaidParticipantProfile[];
  bossLevel: number;
  activeDurationMs: number;
}): number => {
  const {
    expectedRollIntervalSeconds,
    minimumHitsPerParticipant,
    minimumBossHp,
    damageBudgetRatio,
    baseHp,
    hpPerBossLevel,
    timeBudgetFlatHpPerMinute,
  } = getRaidBalance().bossBalance;
  const expectedHitsPerParticipant = Math.max(
    minimumHitsPerParticipant,
    Math.round(activeDurationMs / (expectedRollIntervalSeconds * 1_000)),
  );
  const levelScaledBaseHp = baseHp + bossLevel * hpPerBossLevel;
  const perParticipantScaling = participantProfiles.reduce((total, participant) => {
    return (
      total +
      Math.round(
        getExpectedDamagePerRoll(participant) * expectedHitsPerParticipant * damageBudgetRatio,
      )
    );
  }, 0);
  const timeBudgetMinutes = Math.max(1, Math.round(activeDurationMs / minuteMs));
  const timeBudgetAdjustment = timeBudgetMinutes * (timeBudgetFlatHpPerMinute + bossLevel);

  return Math.max(minimumBossHp, levelScaledBaseHp + perParticipantScaling + timeBudgetAdjustment);
};

const pickBossName = (random: () => number): string => {
  const { prefixes, suffixes } = getRaidBalance().bossNames;
  const prefix = prefixes[Math.floor(random() * prefixes.length)] ?? prefixes[0];
  const suffix = suffixes[Math.floor(random() * suffixes.length)] ?? suffixes[0];
  return `${prefix} ${suffix}`;
};

const resolveRaidRewardPips = (bossLevel: number): number => {
  const rewardTiers = getRaidBalance().reward.pipsByBossLevel;
  let matchedTier = rewardTiers[0];

  for (const rewardTier of rewardTiers) {
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
  const rollBuffText = `x${reward.rollPassMultiplier} roll buff for the next ${reward.rollPassRolls} /dice roll${reward.rollPassRolls === 1 ? "" : "s"}`;
  return `${pipText} and ${rollBuffText} per eligible raider`;
};

export const createRaidBoss = ({
  participantProfiles,
  activeDurationMs,
  random = Math.random,
}: {
  participantProfiles: readonly RaidParticipantProfile[];
  activeDurationMs: number;
  random?: () => number;
}): RaidBossDefinition => {
  const level = calculateBossLevel(participantProfiles);
  const reward = getDefaultRaidReward(level);

  return {
    name: pickBossName(random),
    level,
    maxHp: calculateBossMaxHp({
      participantProfiles,
      bossLevel: level,
      activeDurationMs,
    }),
    reward,
  };
};
