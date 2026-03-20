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
  | "raids"
  | "items"
  | "meta";

export type DiceAchievementManualAward = {
  type: "prestige";
  prestige: number;
};

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
  category: DiceAchievementCategory;
  rule: DiceAchievementRule;
  pipReward?: number;
  manualAward?: DiceAchievementManualAward;
  unlockReasonText?: string;
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

export type DiceRaidPipRewardFormulaData = {
  flatPips: number;
  flatPipsThroughBossLevel: number;
};

export type DiceRaidRollPassRewardData = {
  multiplierPerBossLevel: number;
  minimumMultiplier: number;
  maximumMultiplier: number;
  rollsPerBossLevelDivisor: number;
  minimumRolls: number;
  maximumRolls: number;
};

export type DiceRaidRewardData = {
  pipsFormula: DiceRaidPipRewardFormulaData;
  rollPassBuff: DiceRaidRollPassRewardData;
};

export type DiceRaidBossNamesData = {
  prefixes: string[];
  suffixes: string[];
};

export type DiceRaidBossBalanceData = {
  expectedRollIntervalSeconds: number;
  minimumHitsPerParticipant: number;
  minimumBossHp: number;
  damageBudgetRatio: number;
  baseHp: number;
  hpPerBossLevel: number;
  timeBudgetFlatHpPerMinute: number;
  participantPrestigeWeight: number;
  participantExtraSidesDivisor: number;
  baselineDieSides: number;
  maxBossLevel: number;
};

export type DiceBalanceData = {
  prestigeSides: number[];
  lowerPrestigeBaseLevel: number;
  banStep: number;
  levelUpReward: number;
  firstDailyRollPipReward: number;
  maxRollPassCount: number;
  charge: {
    startAfterMinutes: number;
    maxMultiplier: number;
  };
};

export type DiceRaidData = {
  reward: DiceRaidRewardData;
  bossNames: DiceRaidBossNamesData;
  bossBalance: DiceRaidBossBalanceData;
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
    };

export type DiceItemData = {
  id: string;
  name: string;
  description: string;
  pricePips: number;
  consumable: boolean;
  effect: DiceItemEffect;
};

export type RollyDataSourceKind = "env" | "local" | "example";

export type RollyDataSource = {
  kind: RollyDataSourceKind;
  dir: string;
};

export type LoadedRollyData = {
  source: RollyDataSource;
  achievements: DiceAchievementData[];
  casinoV1: DiceCasinoData;
  diceBalance: DiceBalanceData;
  pvp: DicePvpData;
  randomEventBalance: DiceRandomEventBalanceData;
  raids: DiceRaidData;
  itemsV1: DiceItemData[];
  randomEventsV1: RandomEventScenario[];
};
