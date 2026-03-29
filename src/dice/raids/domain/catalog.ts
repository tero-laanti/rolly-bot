export type RaidRewardDefinition = {
  pips: number;
  rollPassMultiplier: number;
  rollPassRolls: number;
};

export type RaidBossCopyDefinition = {
  recruitmentSummary: string;
  encounterTitle: string;
  successSummary: string;
  failureSummary: string;
};

export type RaidBossDefinition = {
  bossId: string;
  tierId: string;
  name: string;
  level: number;
  maxHp: number;
  reward: RaidRewardDefinition;
  copy: RaidBossCopyDefinition;
};

export type RaidTierDefinition = {
  tierId: string;
  name: string;
  summary: string;
  bosses: readonly RaidBossDefinition[];
};

export type RaidCatalogCopyDefinition = {
  panelTitle: string;
  panelDescription: string;
  startRaidButtonLabel: string;
  joinRaidButtonLabel: string;
  leaveRaidButtonLabel: string;
  startEncounterButtonLabel: string;
  cancelRaidButtonLabel: string;
};
