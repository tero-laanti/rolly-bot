import type { RaidRewardDefinition } from "./catalog";

const buildRaidRewardSummary = (reward: RaidRewardDefinition, pipText: string): string => {
  const rollBuffText = `x${reward.rollPassMultiplier} roll buff for the next ${reward.rollPassRolls} /roll${reward.rollPassRolls === 1 ? "" : "s"}`;
  return `${pipText} and ${rollBuffText} per successful raider`;
};

export const describeRaidReward = (reward: RaidRewardDefinition): string => {
  const pipText = `${reward.pips} pip${reward.pips === 1 ? "" : "s"}`;
  return buildRaidRewardSummary(reward, pipText);
};

export const describeAppliedRaidReward = (
  reward: RaidRewardDefinition,
  awardedPipAmounts: readonly number[],
): string => {
  const normalizedAwardedPips = awardedPipAmounts
    .map((amount) => Math.max(0, Math.floor(amount)))
    .filter((amount) => amount > 0);
  if (normalizedAwardedPips.length < 1) {
    return describeRaidReward(reward);
  }

  const minimumAwardedPips = Math.min(...normalizedAwardedPips);
  const maximumAwardedPips = Math.max(...normalizedAwardedPips);
  if (minimumAwardedPips === maximumAwardedPips) {
    const pipText = `${minimumAwardedPips} pip${minimumAwardedPips === 1 ? "" : "s"}`;
    return buildRaidRewardSummary(reward, pipText);
  }

  return buildRaidRewardSummary(
    reward,
    `${minimumAwardedPips}-${maximumAwardedPips} pips, based on permanent bonuses`,
  );
};
