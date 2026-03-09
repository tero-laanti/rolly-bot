import type { RandomEventScenario } from "../dice/features/random-events/content";
import type {
  RandomEventRarityTier,
  RandomEventVarietyPityConfig,
} from "../dice/features/random-events/variety";

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
  rarityWeightMultipliers: Record<RandomEventRarityTier, number>;
  pity: RandomEventVarietyPityConfig;
};

export type DiceBalanceData = {
  prestigeSides: number[];
  lowerPrestigeBaseLevel: number;
  banStep: number;
  levelUpReward: number;
  maxRollPassCount: number;
  charge: {
    startAfterMinutes: number;
    maxMultiplier: number;
  };
  pvp: {
    maxTier: number;
    challengeExpireMinutes: number;
    loserLockoutBaseMinutes: number;
    winnerBuffBaseMinutes: number;
  };
  randomEvents: {
    claimWindowDurationMultiplier: number;
    variety: DiceBalanceVarietyConfig;
  };
};

export type RollyDataSourceKind = "env" | "local" | "example";

export type RollyDataSource = {
  kind: RollyDataSourceKind;
  dir: string;
};

export type LoadedRollyData = {
  source: RollyDataSource;
  achievements: DiceAchievementData[];
  diceBalance: DiceBalanceData;
  randomEventsV1: RandomEventScenario[];
};
