import type { RandomEventScenario } from "../dice/random-events/domain/content";
import type {
  RandomEventRarityTier,
  RandomEventVarietyPityConfig,
} from "../dice/random-events/domain/variety";

export type DiceAchievementId = string;

export type DiceAchievementCategory =
  | "progression"
  | "roll"
  | "casino"
  | "pvp"
  | "random-events"
  | "world-boss"
  | "items"
  | "meta";

export type DiceAchievementManualAward = {
  type: "prestige";
  prestige: number;
};

export type DiceAchievementAnalyticsMetric =
  | "total-roll-commands-called"
  | "total-dice-rolled"
  | "total-dice-sets-rolled";

export type DiceAchievementRule =
  | {
      type: "ordered-sequence";
      pattern: number[];
    }
  | {
      type: "contains-all-values";
      values: number[];
    }
  | {
      type: "at-least-of-a-kind";
      count: number;
    }
  | {
      type: "count-at-least-of-a-kind";
      count: number;
      groups: number;
    }
  | {
      type: "count-exact-of-a-kind";
      count: number;
      groups: number;
    }
  | {
      type: "ordered-two-pairs";
    }
  | {
      type: "ordered-full-house";
    }
  | {
      type: "contains-value";
      value: number;
    }
  | {
      type: "exact-time";
      hour: number;
      minute: number;
      timezone: string;
    }
  | {
      type: "analytics-at-least";
      metric: DiceAchievementAnalyticsMetric;
      count: number;
    }
  | {
      type: "all-of";
      rules: DiceAchievementRule[];
    }
  | {
      type: "manual";
    };

export type DiceAchievementData = {
  id: DiceAchievementId;
  name: string;
  description: string;
  hidden?: boolean;
  category: DiceAchievementCategory;
  rule: DiceAchievementRule;
  pipReward?: number;
  manualAward?: DiceAchievementManualAward;
  unlockReasonText?: string;
  roleRewardId?: string;
  roleRewardUnlockText?: string;
};

export type DiceBalanceVarietyConfig = {
  antiRepeatCooldownTriggers: number;
  rarityChances: Record<RandomEventRarityTier, number>;
  pity: RandomEventVarietyPityConfig;
};

export type DicePvpData = {
  challengeExpireMinutes: number;
  loserLockoutBaseMinutes: number;
  winnerBuffBaseMinutes: number;
};

export type DiceRandomEventBalanceData = {
  claimWindowDurationMultiplier: number;
  variety: DiceBalanceVarietyConfig;
};

export type DiceWorldBossPipRewardTierData = {
  bossLevelAtLeast: number;
  pips: number;
};

export type DiceWorldBossPipRewardFormulaData = {
  flatPips: number;
  flatPipsThroughBossLevel: number;
};

export type DiceWorldBossRollPassRewardMultiplierData = {
  multiplierPerBossLevel: number;
  minimumMultiplier: number;
  maximumMultiplier: number;
};

export type DiceWorldBossRollPassRewardFormulaData = {
  rollsPerBossLevelDivisor: number;
  minimumRolls: number;
  maximumRolls: number;
};

export type DiceWorldBossRollPassRollsTierData = {
  bossLevelAtLeast: number;
  rolls: number;
};

export type DiceWorldBossRollPassRewardData =
  | (DiceWorldBossRollPassRewardMultiplierData & DiceWorldBossRollPassRewardFormulaData)
  | (DiceWorldBossRollPassRewardMultiplierData & {
      rollsByBossLevel: DiceWorldBossRollPassRollsTierData[];
    });

export type DiceWorldBossRewardData =
  | {
      pipsFormula: DiceWorldBossPipRewardFormulaData;
      rollPassBuff: DiceWorldBossRollPassRewardData;
    }
  | {
      pipsByBossLevel: DiceWorldBossPipRewardTierData[];
      rollPassBuff: DiceWorldBossRollPassRewardData;
    };

export type DiceWorldBossBossNamesData = {
  prefixes: string[];
  suffixes: string[];
};

export type DiceWorldBossBossBalanceData = {
  baseHp: number;
  hpIncreasePerBossLevelPercent: number;
  levelHalfLifeLevels: number;
  maxBossLevel: number;
};

export type DiceRaidRollPassRewardData = DiceWorldBossRollPassRewardMultiplierData &
  DiceWorldBossRollPassRewardFormulaData;

export type DiceRaidRewardData = {
  pips: number;
  rollPassBuff: DiceRaidRollPassRewardData;
};

export type DiceRaidBossCopyData = {
  recruitmentSummary: string;
  encounterTitle: string;
  successSummary: string;
  failureSummary: string;
};

export type DiceRaidBossData = {
  bossId: string;
  tierId: string;
  name: string;
  level: number;
  maxHp: number;
  reward: DiceRaidRewardData;
  copy: DiceRaidBossCopyData;
};

export type DiceRaidTierData = {
  tierId: string;
  name: string;
  order: number;
  summary: string;
  bossIds: string[];
  roleReward?: {
    roleRewardId: string;
    unlockAnnouncementText: string;
  };
};

export type DiceRaidsCopyData = {
  panelTitle: string;
  panelDescription: string;
  startRaidButtonLabel: string;
  joinRaidButtonLabel: string;
  leaveRaidButtonLabel: string;
  startEncounterButtonLabel: string;
  cancelRaidButtonLabel: string;
};

export type DiceRaidsData = {
  tiers: DiceRaidTierData[];
  bosses: DiceRaidBossData[];
  copy: DiceRaidsCopyData;
};

export type DiceContractObjectiveType =
  | "roll_count"
  | "pvp_win_count"
  | "casino_game_count"
  | "world_boss_join_count";

export type DiceContractObjectiveData = {
  type: DiceContractObjectiveType;
  requiredCount: number;
};

export type DiceContractRewardData = {
  pips?: number;
  fame?: number;
};

export type DiceContractData = {
  id: string;
  title: string;
  description: string;
  objective: DiceContractObjectiveData;
  reward: DiceContractRewardData;
};

export type DiceContractDifficulty = "simple" | "serious" | "brutal";

export type DiceContractOfferData = Omit<DiceContractData, "reward">;

export type DiceContractsPanelData = {
  title: string;
  imageUrl: string;
  description: string;
  helperText: string;
  dailyButtonLabel: string;
  weeklyButtonLabel: string;
  askForContractButtonLabel: string;
};

export type DiceContractsDifficultyData = {
  label: string;
  rewardPips: number;
  initialOffers: DiceContractData[];
  refillOffers: DiceContractData[];
};

export type DiceContractsCadenceMetadataData = {
  label: string;
  chooserTitle: string;
  chooserDescription: string;
  difficulties: Record<DiceContractDifficulty, DiceContractsDifficultyData>;
};

export type DiceContractsCadenceData = DiceContractData[] & DiceContractsCadenceMetadataData;

export type DiceContractsData = {
  panel: DiceContractsPanelData;
  daily: DiceContractsCadenceData;
  weekly: DiceContractsCadenceData;
};

export type DiceBalanceData = {
  prestigeSides: number[];
  lowerPrestigeBaseDiceCount: number;
  banStep: number;
  diceCountIncreaseReward: number;
  firstDailyRollPipReward: number;
  maxRollPassCount: number;
  charge: {
    startAfterMinutes: number;
    maxMultiplier: number;
  };
};

export type DiceWorldBossData = {
  reward: DiceWorldBossRewardData;
  bossNames: DiceWorldBossBossNamesData;
  bossBalance: DiceWorldBossBossBalanceData;
};

export type DiceCasinoPayoutRatio = {
  numerator: number;
  denominator: number;
};

export type DiceCasinoPushYourLuckPayoutData = DiceCasinoPayoutRatio & {
  uniqueFaces: number;
};

export type DiceCasinoData = {
  bet: {
    min: number;
    max: number;
    default: number;
    sessionTimeoutMinutes: number;
  };
  exactRoll: {
    dieSides: number;
    highLowLowMaxFace: number;
    facePayout: DiceCasinoPayoutRatio;
    highLowPayout: DiceCasinoPayoutRatio;
  };
  pushYourLuck: {
    dieSides: number;
    cashoutStartsAtUniqueFaces: number;
    autoCashoutAtUniqueFaces: number;
    payouts: DiceCasinoPushYourLuckPayoutData[];
  };
  blackjack: {
    dieSides: number;
    initialCardsPerHand: number;
    dealerStandOnTotal: number;
    naturalPayout: DiceCasinoPayoutRatio;
    winPayoutMultiplier: number;
  };
  dicePoker: {
    payoutMultipliers: {
      fiveOfAKind: number;
      fourOfAKind: number;
      fullHouse: number;
      straight: number;
    };
  };
};

export type DiceItemEffect =
  | {
      type: "negative-effect-shield";
      charges: number;
    }
  | {
      type: "garden-seed";
      outcomes: Array<{
        sides: 4 | 6 | 8 | 10 | 12;
        weight: number;
      }>;
    }
  | {
      type: "double-roll-uses";
      uses: number;
    }
  | {
      type: "double-roll-duration";
      minutes: number;
    }
  | {
      type: "trigger-random-group-event";
    }
  | {
      type: "auto-roll-session";
      durationSeconds: number;
      intervalSeconds: number;
    }
  | {
      type: "cleanse-all-negative-effects";
    }
  | {
      type: "passive-garden-unlock";
      slotCount: number;
    }
  | {
      type: "passive-extra-shield-on-umbrella";
      extraCharges: number;
    }
  | {
      type: "passive-pvp-loser-lockout-reduction";
      reductionPercent: number;
      minimumMinutes: number;
    }
  | {
      type: "passive-cleanse-grants-negative-effect-shield";
      charges: number;
    }
  | {
      type: "passive-extra-ban-slot";
      extraSlots: number;
    }
  | {
      type: "passive-pip-reward-bonus";
      bonusPercent: number;
    }
  | {
      type: "passive-personal-charge-unlock";
      minutesPerMultiplier: number;
      maxMultiplier: number;
    }
  | {
      type: "passive-personal-charge-speed-bonus";
      fasterPercent: number;
    }
  | {
      type: "passive-personal-charge-cap-bonus";
      extraMaxMultiplier: number;
    };

export type DiceItemRepeatablePricing = {
  priceIncreasePipsPerOwned: number;
};

export type DiceItemData = {
  id: string;
  name: string;
  description: string;
  pricePips: number;
  consumable: boolean;
  repeatablePricing?: DiceItemRepeatablePricing;
  requiresItemId?: string;
  effect: DiceItemEffect;
};

export type IntroPostMessageData = {
  content: string;
};

export type IntroPostsV1Data = {
  messages: IntroPostMessageData[];
};

export type BeginnerOnboardingGuildData = {
  guildId: string;
  beginnerChannelId: string;
  joinMessage: string;
  graduationChannelId?: string;
  graduationMessage?: string;
  graduationRoleId?: string;
};

export type BeginnerOnboardingV1Data = {
  guilds: BeginnerOnboardingGuildData[];
};

export type RollyDataSourceKind = "env" | "local" | "example";

export type RollyDataSource = {
  kind: RollyDataSourceKind;
  dir: string;
};

export type LoadedRollyData = {
  source: RollyDataSource;
  achievements: DiceAchievementData[];
  beginnerOnboardingV1: BeginnerOnboardingV1Data | null;
  casinoV1: DiceCasinoData;
  contracts: DiceContractsData | null;
  diceBalance: DiceBalanceData;
  introPostsV1: IntroPostsV1Data;
  pvp: DicePvpData;
  randomEventBalance: DiceRandomEventBalanceData;
  raids: DiceRaidsData;
  worldBoss: DiceWorldBossData;
  itemsV1: DiceItemData[];
  randomEventsV1: RandomEventScenario[];
};
