import { getDiceBalanceData } from "../../../rolly-data/load";
import { getBaseRollPassCount } from "../../progression/domain/game-rules";
import { minuteMs } from "../../../shared/time";

export type RaidParticipantProfile = {
  userId: string;
  level: number;
  prestige: number;
  dieSides: number;
};

export type RaidRewardDefinition = {
  type: "roll-pass-multiplier";
  multiplier: number;
  rolls: number;
};

export type RaidBossDefinition = {
  name: string;
  level: number;
  maxHp: number;
  reward: RaidRewardDefinition;
};

const getRaidBalance = () => {
  return getDiceBalanceData().raids;
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

export const getDefaultRaidReward = (): RaidRewardDefinition => {
  const { reward } = getRaidBalance();
  return {
    type: "roll-pass-multiplier",
    multiplier: reward.rollPassMultiplier,
    rolls: reward.rolls,
  };
};

export const describeRaidReward = (reward: RaidRewardDefinition): string => {
  if (reward.type === "roll-pass-multiplier") {
    return `x${reward.multiplier} roll buff for the next ${reward.rolls} /dice rolls`;
  }

  return "temporary raid reward";
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
  const reward = getDefaultRaidReward();

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
