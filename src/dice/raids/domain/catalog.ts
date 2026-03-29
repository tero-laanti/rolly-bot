export type RaidRewardDefinition = {
  pips: number;
  rollPassMultiplier: number;
  rollPassRolls: number;
};

export type RaidBossDefinition = {
  bossId: string;
  tierId: string;
  name: string;
  level: number;
  maxHp: number;
  reward: RaidRewardDefinition;
};

export type RaidTierDefinition = {
  tierId: string;
  name: string;
  summary: string;
  bosses: readonly RaidBossDefinition[];
};
