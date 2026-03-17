import type { RandomEventScenario } from "../dice/random-events/domain/content";
import type {
  RandomEventRarityTier,
  RandomEventVarietyPityConfig,
} from "../dice/random-events/domain/variety";

export type DiceAchievementId = string;

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
  rule: DiceAchievementRule;
  manualAward?: DiceAchievementManualAward;
};

export type DiceBalanceVarietyConfig = {
  antiRepeatCooldownTriggers: number;
  rarityChances: Record<RandomEventRarityTier, number>;
  pity: RandomEventVarietyPityConfig;
};

export type DiceBalanceData = {
  prestigeSides: number[];
  lowerPrestigeBaseLevel: number;
  banStep: number;
  levelUpReward: number;
  charge: {
    startAfterMinutes: number;
    maxMultiplier: number;
  };
  pvp: {
    challengeExpireMinutes: number;
    loserLockoutBaseMinutes: number;
    winnerBuffBaseMinutes: number;
  };
  randomEvents: {
    claimWindowDurationMultiplier: number;
    variety: DiceBalanceVarietyConfig;
  };
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
  itemsV1: DiceItemData[];
  randomEventsV1: RandomEventScenario[];
};
