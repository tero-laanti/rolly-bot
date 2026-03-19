import type {
  DiceAchievementData,
  DiceAchievementManualAward,
  DiceCasinoData,
  DiceCasinoPayoutRatio,
  DiceCasinoPushYourLuckPayoutData,
  DiceAchievementRule,
  DiceBalanceData,
  DiceItemData,
  DiceItemEffect,
  DiceBalanceVarietyConfig,
  DiceRaidBossBalanceData,
  DiceRaidBossNamesData,
  DiceRaidRewardData,
} from "./types";
import type {
  RandomEventClaimActivityTemplates,
  RandomEventEffect,
  RandomEventOutcome,
  RandomEventScenario,
} from "../dice/random-events/domain/content";
import type {
  RandomEventRollChallengeDefinition,
  RandomEventRollChallengeStep,
  RandomEventRollSource,
} from "../dice/random-events/domain/roll-challenges";
import type { RandomEventClaimPolicy } from "../dice/random-events/domain/claim-policy";
import type {
  RandomEventRarityTier,
  RandomEventVarietyPityConfig,
} from "../dice/random-events/domain/variety";

type UnknownRecord = Record<string, unknown>;

const rarityTiers = ["common", "uncommon", "rare", "epic", "legendary"] as const;
const claimPolicies = ["first-click", "multi-user"] as const;
const achievementRuleTypes = [
  "ordered-sequence",
  "contains-all-values",
  "at-least-of-a-kind",
  "count-at-least-of-a-kind",
  "count-exact-of-a-kind",
  "ordered-two-pairs",
  "ordered-full-house",
  "contains-value",
  "exact-time",
  "all-of",
  "manual",
] as const;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const assertRecord = (value: unknown, label: string): UnknownRecord => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
};

const readString = (value: unknown, label: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  return value;
};

const readNonEmptyString = (value: unknown, label: string): string => {
  const parsed = readString(value, label).trim();
  if (parsed.length < 1) {
    throw new Error(`${label} must not be empty.`);
  }

  return parsed;
};

const readFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
};

const readInteger = (
  value: unknown,
  label: string,
  minValue: number = Number.MIN_SAFE_INTEGER,
): number => {
  const parsed = readFiniteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < minValue) {
    throw new Error(`${label} must be an integer >= ${minValue}.`);
  }

  return parsed;
};

const readBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
};

const readOptionalFiniteNumber = (value: unknown, label: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readFiniteNumber(value, label);
};

const readStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => readNonEmptyString(entry, `${label}[${index}]`));
};

const readFiniteNumberAtLeast = (value: unknown, label: string, minValue: number): number => {
  const parsed = readFiniteNumber(value, label);
  if (parsed < minValue) {
    throw new Error(`${label} must be >= ${minValue}.`);
  }

  return parsed;
};

const readIntegerArray = (value: unknown, label: string, minValue: number = 1): number[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => readInteger(entry, `${label}[${index}]`, minValue));
};

const readClaimPolicy = (value: unknown, label: string): RandomEventClaimPolicy => {
  const parsed = readNonEmptyString(value, label);
  if (!claimPolicies.includes(parsed as RandomEventClaimPolicy)) {
    throw new Error(`${label} must be one of ${claimPolicies.join(", ")}.`);
  }

  return parsed as RandomEventClaimPolicy;
};

const readRarityTier = (value: unknown, label: string): RandomEventRarityTier => {
  const parsed = readNonEmptyString(value, label);
  if (!rarityTiers.includes(parsed as RandomEventRarityTier)) {
    throw new Error(`${label} must be one of ${rarityTiers.join(", ")}.`);
  }

  return parsed as RandomEventRarityTier;
};

const readTextVariables = (value: unknown, label: string): Record<string, string[]> | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const record = assertRecord(value, label);
  const parsed: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(record)) {
    const normalizedKey = key.trim();
    if (normalizedKey.length < 1) {
      throw new Error(`${label} keys must not be empty.`);
    }

    parsed[normalizedKey] = readStringArray(entry, `${label}.${normalizedKey}`);
  }

  return parsed;
};

const readClaimActivityTemplates = (
  value: unknown,
  label: string,
): RandomEventClaimActivityTemplates | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const record = assertRecord(value, label);
  return {
    accepted: readStringArray(record.accepted, `${label}.accepted`),
    alreadyReady: readStringArray(record.alreadyReady, `${label}.alreadyReady`),
  };
};

const readRollSource = (value: unknown, label: string): RandomEventRollSource => {
  const record = assertRecord(value, label);
  const type = readNonEmptyString(record.type, `${label}.type`);
  if (type === "player-die") {
    return {
      type,
      dieIndex:
        record.dieIndex === undefined
          ? undefined
          : readInteger(record.dieIndex, `${label}.dieIndex`, 1),
      useBans:
        record.useBans === undefined
          ? undefined
          : (() => {
              if (typeof record.useBans !== "boolean") {
                throw new Error(`${label}.useBans must be a boolean.`);
              }

              return record.useBans;
            })(),
    };
  }

  if (type === "static-die") {
    return {
      type,
      sides: readInteger(record.sides, `${label}.sides`, 2),
    };
  }

  throw new Error(`${label}.type must be "player-die" or "static-die".`);
};

const readRollChallengeStep = (value: unknown, label: string): RandomEventRollChallengeStep => {
  const record = assertRecord(value, label);
  const comparator = readNonEmptyString(record.comparator, `${label}.comparator`);
  if (comparator !== "gte" && comparator !== "lte" && comparator !== "eq") {
    throw new Error(`${label}.comparator must be gte, lte, or eq.`);
  }

  return {
    id: readNonEmptyString(record.id, `${label}.id`),
    label: readNonEmptyString(record.label, `${label}.label`),
    source: readRollSource(record.source, `${label}.source`),
    target: readFiniteNumber(record.target, `${label}.target`),
    comparator,
  };
};

const readRollChallengeDefinition = (
  value: unknown,
  label: string,
): RandomEventRollChallengeDefinition | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const record = assertRecord(value, label);
  const mode = readNonEmptyString(record.mode, `${label}.mode`);
  if (mode !== "single-step" && mode !== "sequence") {
    throw new Error(`${label}.mode must be "single-step" or "sequence".`);
  }

  if (!Array.isArray(record.steps)) {
    throw new Error(`${label}.steps must be an array.`);
  }

  return {
    id: readNonEmptyString(record.id, `${label}.id`),
    mode,
    steps: record.steps.map((entry, index) =>
      readRollChallengeStep(entry, `${label}.steps[${index}]`),
    ),
    failOnFirstMiss:
      record.failOnFirstMiss === undefined
        ? undefined
        : (() => {
            if (typeof record.failOnFirstMiss !== "boolean") {
              throw new Error(`${label}.failOnFirstMiss must be a boolean.`);
            }

            return record.failOnFirstMiss;
          })(),
  };
};

const readRandomEventEffect = (value: unknown, label: string): RandomEventEffect => {
  const record = assertRecord(value, label);
  const type = readNonEmptyString(record.type, `${label}.type`);

  if (type === "currency") {
    return {
      type,
      minAmount: readInteger(record.minAmount, `${label}.minAmount`, 0),
      maxAmount: readInteger(record.maxAmount, `${label}.maxAmount`, 0),
    };
  }

  if (type === "temporary-roll-multiplier") {
    const stackMode = readNonEmptyString(record.stackMode, `${label}.stackMode`);
    if (
      stackMode !== "stack" &&
      stackMode !== "refresh" &&
      stackMode !== "replace" &&
      stackMode !== "no-stack"
    ) {
      throw new Error(`${label}.stackMode is invalid.`);
    }

    return {
      type,
      multiplier: readInteger(record.multiplier, `${label}.multiplier`, 1),
      rolls: readInteger(record.rolls, `${label}.rolls`, 1),
      stackMode,
    };
  }

  if (type === "temporary-roll-penalty") {
    const stackMode = readNonEmptyString(record.stackMode, `${label}.stackMode`);
    if (stackMode !== "refresh" && stackMode !== "replace" && stackMode !== "no-stack") {
      throw new Error(`${label}.stackMode is invalid.`);
    }

    return {
      type,
      divisor: readInteger(record.divisor, `${label}.divisor`, 1),
      rolls: readInteger(record.rolls, `${label}.rolls`, 1),
      stackMode,
    };
  }

  if (type === "temporary-lockout") {
    return {
      type,
      durationMinutes: readInteger(record.durationMinutes, `${label}.durationMinutes`, 1),
    };
  }

  throw new Error(`${label}.type is invalid.`);
};

const readRandomEventOutcome = (value: unknown, label: string): RandomEventOutcome => {
  const record = assertRecord(value, label);
  if (!Array.isArray(record.effects)) {
    throw new Error(`${label}.effects must be an array.`);
  }

  return {
    id: readNonEmptyString(record.id, `${label}.id`),
    weight: readOptionalFiniteNumber(record.weight, `${label}.weight`),
    message: readNonEmptyString(record.message, `${label}.message`),
    effects: record.effects.map((entry, index) =>
      readRandomEventEffect(entry, `${label}.effects[${index}]`),
    ),
    textVariables: readTextVariables(record.textVariables, `${label}.textVariables`),
  };
};

const readRandomEventScenario = (value: unknown, label: string): RandomEventScenario => {
  const record = assertRecord(value, label);
  if (!Array.isArray(record.outcomes)) {
    throw new Error(`${label}.outcomes must be an array.`);
  }

  const challengeOutcomeIdsRecord =
    record.challengeOutcomeIds === undefined
      ? undefined
      : assertRecord(record.challengeOutcomeIds, `${label}.challengeOutcomeIds`);

  return {
    id: readNonEmptyString(record.id, `${label}.id`),
    rarity: readRarityTier(record.rarity, `${label}.rarity`),
    title: readNonEmptyString(record.title, `${label}.title`),
    prompt: readNonEmptyString(record.prompt, `${label}.prompt`),
    claimLabel: readNonEmptyString(record.claimLabel, `${label}.claimLabel`),
    claimPolicy: readClaimPolicy(record.claimPolicy, `${label}.claimPolicy`),
    claimWindowSeconds: readInteger(record.claimWindowSeconds, `${label}.claimWindowSeconds`, 1),
    weight: readOptionalFiniteNumber(record.weight, `${label}.weight`),
    textVariables: readTextVariables(record.textVariables, `${label}.textVariables`),
    rollChallenge: readRollChallengeDefinition(record.rollChallenge, `${label}.rollChallenge`),
    challengeOutcomeIds:
      challengeOutcomeIdsRecord === undefined
        ? undefined
        : {
            success: readStringArray(
              challengeOutcomeIdsRecord.success,
              `${label}.challengeOutcomeIds.success`,
            ),
            failure: readStringArray(
              challengeOutcomeIdsRecord.failure,
              `${label}.challengeOutcomeIds.failure`,
            ),
          },
    outcomes: record.outcomes.map((entry, index) =>
      readRandomEventOutcome(entry, `${label}.outcomes[${index}]`),
    ),
    activityTemplates: readClaimActivityTemplates(
      record.activityTemplates,
      `${label}.activityTemplates`,
    ),
  };
};

const readManualAward = (value: unknown, label: string): DiceAchievementManualAward | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const record = assertRecord(value, label);
  const type = readNonEmptyString(record.type, `${label}.type`);
  if (type !== "prestige") {
    throw new Error(`${label}.type must be "prestige".`);
  }

  return {
    type,
    prestige: readInteger(record.prestige, `${label}.prestige`, 1),
  };
};

const readAchievementRule = (value: unknown, label: string): DiceAchievementRule => {
  const record = assertRecord(value, label);
  const type = readNonEmptyString(record.type, `${label}.type`);
  if (!achievementRuleTypes.includes(type as (typeof achievementRuleTypes)[number])) {
    throw new Error(`${label}.type is invalid.`);
  }

  if (type === "ordered-sequence") {
    return {
      type,
      pattern: readIntegerArray(record.pattern, `${label}.pattern`, 1),
    };
  }

  if (type === "contains-all-values") {
    return {
      type,
      values: readIntegerArray(record.values, `${label}.values`, 1),
    };
  }

  if (type === "at-least-of-a-kind") {
    return {
      type,
      count: readInteger(record.count, `${label}.count`, 1),
    };
  }

  if (type === "count-at-least-of-a-kind" || type === "count-exact-of-a-kind") {
    return {
      type,
      count: readInteger(record.count, `${label}.count`, 1),
      groups: readInteger(record.groups, `${label}.groups`, 1),
    };
  }

  if (type === "ordered-two-pairs" || type === "ordered-full-house" || type === "manual") {
    return { type };
  }

  if (type === "contains-value") {
    return {
      type,
      value: readInteger(record.value, `${label}.value`, 1),
    };
  }

  if (type === "exact-time") {
    return {
      type,
      hour: readInteger(record.hour, `${label}.hour`, 0),
      minute: readInteger(record.minute, `${label}.minute`, 0),
      timezone: readNonEmptyString(record.timezone, `${label}.timezone`),
    };
  }

  if (!Array.isArray(record.rules)) {
    throw new Error(`${label}.rules must be an array.`);
  }

  return {
    type: "all-of",
    rules: record.rules.map((entry, index) =>
      readAchievementRule(entry, `${label}.rules[${index}]`),
    ),
  };
};

const readRarityNumberRecord = (
  value: unknown,
  label: string,
): Record<RandomEventRarityTier, number> => {
  const record = assertRecord(value, label);
  return {
    common: readFiniteNumber(record.common, `${label}.common`),
    uncommon: readFiniteNumber(record.uncommon, `${label}.uncommon`),
    rare: readFiniteNumber(record.rare, `${label}.rare`),
    epic: readFiniteNumber(record.epic, `${label}.epic`),
    legendary: readFiniteNumber(record.legendary, `${label}.legendary`),
  };
};

const validateParsedRollChallengeDefinition = (
  challenge: RandomEventRollChallengeDefinition,
): void => {
  if (challenge.id.trim().length < 1) {
    throw new Error("Roll challenge id cannot be empty.");
  }

  if (challenge.steps.length < 1) {
    throw new Error(`Roll challenge ${challenge.id} must include at least one step.`);
  }

  const ids = new Set<string>();
  for (const step of challenge.steps) {
    if (ids.has(step.id)) {
      throw new Error(`Roll challenge ${challenge.id} has duplicate step id ${step.id}.`);
    }

    ids.add(step.id);
  }

  if (challenge.mode === "single-step" && challenge.steps.length !== 1) {
    throw new Error(
      `Roll challenge ${challenge.id} single-step mode must define exactly one step.`,
    );
  }
};

const validateParsedRandomEventScenario = (scenario: RandomEventScenario): void => {
  if (scenario.id.trim().length < 1) {
    throw new Error("Random event scenario id cannot be empty.");
  }

  if (scenario.title.trim().length < 1) {
    throw new Error(`Random event scenario ${scenario.id} must have a title.`);
  }

  if (scenario.prompt.trim().length < 1) {
    throw new Error(`Random event scenario ${scenario.id} must have a prompt.`);
  }

  if (scenario.claimWindowSeconds < 10) {
    throw new Error(`Random event scenario ${scenario.id} must have at least 10s claim window.`);
  }

  if (scenario.outcomes.length < 1) {
    throw new Error(`Random event scenario ${scenario.id} must define at least one outcome.`);
  }

  if (scenario.rollChallenge) {
    validateParsedRollChallengeDefinition(scenario.rollChallenge);
  }

  if (scenario.challengeOutcomeIds) {
    const outcomeIdSet = new Set(scenario.outcomes.map((outcome) => outcome.id));
    for (const [key, outcomeIds] of Object.entries(scenario.challengeOutcomeIds) as Array<
      ["success" | "failure", string[]]
    >) {
      if (outcomeIds.length < 1) {
        throw new Error(
          `Scenario ${scenario.id} challengeOutcomeIds.${key} must have at least one id.`,
        );
      }

      for (const outcomeId of outcomeIds) {
        if (!outcomeIdSet.has(outcomeId)) {
          throw new Error(
            `Scenario ${scenario.id} challengeOutcomeIds.${key} references missing outcome '${outcomeId}'.`,
          );
        }
      }
    }
  }
};

const validateParsedRandomEventScenarios = (scenarios: RandomEventScenario[]): void => {
  const ids = new Set<string>();
  for (const scenario of scenarios) {
    validateParsedRandomEventScenario(scenario);
    if (ids.has(scenario.id)) {
      throw new Error(`Duplicate random event scenario id: ${scenario.id}`);
    }

    ids.add(scenario.id);
  }
};

const readPityConfig = (value: unknown, label: string): RandomEventVarietyPityConfig => {
  const record = assertRecord(value, label);
  if (typeof record.enabled !== "boolean") {
    throw new Error(`${label}.enabled must be a boolean.`);
  }

  return {
    enabled: record.enabled,
    startAfterNonRareTriggers: readInteger(
      record.startAfterNonRareTriggers,
      `${label}.startAfterNonRareTriggers`,
      0,
    ),
    rareWeightStep: readFiniteNumber(record.rareWeightStep, `${label}.rareWeightStep`),
    epicWeightStep: readFiniteNumber(record.epicWeightStep, `${label}.epicWeightStep`),
    legendaryWeightStep: readFiniteNumber(
      record.legendaryWeightStep,
      `${label}.legendaryWeightStep`,
    ),
    maxBonusMultiplier: readFiniteNumber(record.maxBonusMultiplier, `${label}.maxBonusMultiplier`),
  };
};

const readVarietyConfig = (value: unknown, label: string): DiceBalanceVarietyConfig => {
  const record = assertRecord(value, label);
  return {
    antiRepeatCooldownTriggers: readInteger(
      record.antiRepeatCooldownTriggers,
      `${label}.antiRepeatCooldownTriggers`,
      0,
    ),
    rarityChances: readRarityNumberRecord(record.rarityChances, `${label}.rarityChances`),
    pity: readPityConfig(record.pity, `${label}.pity`),
  };
};

const readDiceItemEffect = (value: unknown, label: string): DiceItemEffect => {
  const record = assertRecord(value, label);
  const type = readNonEmptyString(record.type, `${label}.type`);

  if (type === "negative-effect-shield") {
    return {
      type,
      charges: readInteger(record.charges, `${label}.charges`, 1),
    };
  }

  if (type === "double-roll-uses") {
    return {
      type,
      uses: readInteger(record.uses, `${label}.uses`, 1),
    };
  }

  if (type === "double-roll-duration") {
    return {
      type,
      minutes: readInteger(record.minutes, `${label}.minutes`, 1),
    };
  }

  if (type === "trigger-random-group-event") {
    return { type };
  }

  if (type === "auto-roll-session") {
    return {
      type,
      durationSeconds: readInteger(record.durationSeconds, `${label}.durationSeconds`, 1),
      intervalSeconds: readInteger(record.intervalSeconds, `${label}.intervalSeconds`, 1),
    };
  }

  if (type === "cleanse-all-negative-effects") {
    return { type };
  }

  throw new Error(`${label}.type is invalid.`);
};

export const parseDiceAchievements = (value: unknown): DiceAchievementData[] => {
  if (!Array.isArray(value)) {
    throw new Error("Achievements data must be an array.");
  }

  const parsed = value.map((entry, index) => {
    const record = assertRecord(entry, `achievements[${index}]`);
    return {
      id: readNonEmptyString(record.id, `achievements[${index}].id`),
      name: readNonEmptyString(record.name, `achievements[${index}].name`),
      description: readNonEmptyString(record.description, `achievements[${index}].description`),
      rule: readAchievementRule(record.rule, `achievements[${index}].rule`),
      manualAward: readManualAward(record.manualAward, `achievements[${index}].manualAward`),
    };
  });

  const ids = new Set<string>();
  const prestigeAwards = new Set<number>();
  for (const achievement of parsed) {
    if (ids.has(achievement.id)) {
      throw new Error(`Duplicate achievement id: ${achievement.id}`);
    }

    ids.add(achievement.id);

    if (achievement.manualAward?.type === "prestige") {
      if (prestigeAwards.has(achievement.manualAward.prestige)) {
        throw new Error(
          `Duplicate prestige achievement mapping for prestige ${achievement.manualAward.prestige}.`,
        );
      }

      prestigeAwards.add(achievement.manualAward.prestige);
    }
  }

  return parsed;
};

const readCasinoPayoutRatio = (value: unknown, label: string): DiceCasinoPayoutRatio => {
  const record = assertRecord(value, label);
  return {
    numerator: readInteger(record.numerator, `${label}.numerator`, 1),
    denominator: readInteger(record.denominator, `${label}.denominator`, 1),
  };
};

const readCasinoPushYourLuckPayout = (
  value: unknown,
  label: string,
): DiceCasinoPushYourLuckPayoutData => {
  const record = assertRecord(value, label);
  return {
    uniqueFaces: readInteger(record.uniqueFaces, `${label}.uniqueFaces`, 1),
    ...readCasinoPayoutRatio(record, label),
  };
};

const readRaidRewardConfig = (value: unknown, label: string): DiceRaidRewardData => {
  const record = assertRecord(value, label);
  if (!Array.isArray(record.pipsByBossLevel)) {
    throw new Error(`${label}.pipsByBossLevel must be an array.`);
  }

  const rewardTiers = record.pipsByBossLevel.map((entry, index) => {
    const tierRecord = assertRecord(entry, `${label}.pipsByBossLevel[${index}]`);
    return {
      bossLevelAtLeast: readInteger(
        tierRecord.bossLevelAtLeast,
        `${label}.pipsByBossLevel[${index}].bossLevelAtLeast`,
        1,
      ),
      pips: readInteger(tierRecord.pips, `${label}.pipsByBossLevel[${index}].pips`, 0),
    };
  });

  if (rewardTiers.length < 1) {
    throw new Error(`${label}.pipsByBossLevel must include at least one entry.`);
  }

  if (rewardTiers[0]?.bossLevelAtLeast !== 1) {
    throw new Error(`${label}.pipsByBossLevel must start at bossLevelAtLeast = 1.`);
  }

  for (let index = 1; index < rewardTiers.length; index += 1) {
    const previousTier = rewardTiers[index - 1];
    const currentTier = rewardTiers[index];
    if (!previousTier || !currentTier) {
      continue;
    }

    if (currentTier.bossLevelAtLeast <= previousTier.bossLevelAtLeast) {
      throw new Error(
        `${label}.pipsByBossLevel must be sorted by ascending bossLevelAtLeast with no duplicates.`,
      );
    }
  }

  const rollPassBuff = assertRecord(record.rollPassBuff, `${label}.rollPassBuff`);
  const parsedRollPassBuff = {
    multiplierPerBossLevel: readFiniteNumberAtLeast(
      rollPassBuff.multiplierPerBossLevel,
      `${label}.rollPassBuff.multiplierPerBossLevel`,
      0,
    ),
    minimumMultiplier: readInteger(
      rollPassBuff.minimumMultiplier,
      `${label}.rollPassBuff.minimumMultiplier`,
      1,
    ),
    maximumMultiplier: readInteger(
      rollPassBuff.maximumMultiplier,
      `${label}.rollPassBuff.maximumMultiplier`,
      1,
    ),
    rollsPerBossLevelDivisor: readFiniteNumberAtLeast(
      rollPassBuff.rollsPerBossLevelDivisor,
      `${label}.rollPassBuff.rollsPerBossLevelDivisor`,
      1,
    ),
    minimumRolls: readInteger(rollPassBuff.minimumRolls, `${label}.rollPassBuff.minimumRolls`, 1),
    maximumRolls: readInteger(rollPassBuff.maximumRolls, `${label}.rollPassBuff.maximumRolls`, 1),
  };

  if (parsedRollPassBuff.maximumMultiplier < parsedRollPassBuff.minimumMultiplier) {
    throw new Error(`${label}.rollPassBuff.maximumMultiplier must be at least minimumMultiplier.`);
  }

  if (parsedRollPassBuff.maximumRolls < parsedRollPassBuff.minimumRolls) {
    throw new Error(`${label}.rollPassBuff.maximumRolls must be at least minimumRolls.`);
  }

  return {
    pipsByBossLevel: rewardTiers,
    rollPassBuff: parsedRollPassBuff,
  };
};

const readRaidBossNamesConfig = (value: unknown, label: string): DiceRaidBossNamesData => {
  const record = assertRecord(value, label);
  const prefixes = readStringArray(record.prefixes, `${label}.prefixes`);
  const suffixes = readStringArray(record.suffixes, `${label}.suffixes`);

  if (prefixes.length < 1) {
    throw new Error(`${label}.prefixes must include at least one entry.`);
  }

  if (suffixes.length < 1) {
    throw new Error(`${label}.suffixes must include at least one entry.`);
  }

  return {
    prefixes,
    suffixes,
  };
};

const readRaidBossBalanceConfig = (value: unknown, label: string): DiceRaidBossBalanceData => {
  const record = assertRecord(value, label);
  return {
    expectedRollIntervalSeconds: readFiniteNumberAtLeast(
      record.expectedRollIntervalSeconds,
      `${label}.expectedRollIntervalSeconds`,
      1,
    ),
    minimumHitsPerParticipant: readInteger(
      record.minimumHitsPerParticipant,
      `${label}.minimumHitsPerParticipant`,
      1,
    ),
    minimumBossHp: readInteger(record.minimumBossHp, `${label}.minimumBossHp`, 1),
    damageBudgetRatio: readFiniteNumberAtLeast(
      record.damageBudgetRatio,
      `${label}.damageBudgetRatio`,
      0,
    ),
    baseHp: readInteger(record.baseHp, `${label}.baseHp`, 1),
    hpPerBossLevel: readInteger(record.hpPerBossLevel, `${label}.hpPerBossLevel`, 0),
    timeBudgetFlatHpPerMinute: readInteger(
      record.timeBudgetFlatHpPerMinute,
      `${label}.timeBudgetFlatHpPerMinute`,
      0,
    ),
    participantPrestigeWeight: readFiniteNumberAtLeast(
      record.participantPrestigeWeight,
      `${label}.participantPrestigeWeight`,
      0,
    ),
    participantExtraSidesDivisor: readFiniteNumberAtLeast(
      record.participantExtraSidesDivisor,
      `${label}.participantExtraSidesDivisor`,
      1,
    ),
    baselineDieSides: readInteger(record.baselineDieSides, `${label}.baselineDieSides`, 2),
    maxBossLevel: readInteger(record.maxBossLevel, `${label}.maxBossLevel`, 1),
  };
};

export const parseDiceBalance = (value: unknown): DiceBalanceData => {
  const record = assertRecord(value, "diceBalance");
  const charge = assertRecord(record.charge, "diceBalance.charge");
  const pvp = assertRecord(record.pvp, "diceBalance.pvp");
  const randomEvents = assertRecord(record.randomEvents, "diceBalance.randomEvents");
  const raids = assertRecord(record.raids, "diceBalance.raids");

  const parsed: DiceBalanceData = {
    prestigeSides: readIntegerArray(record.prestigeSides, "diceBalance.prestigeSides", 2),
    lowerPrestigeBaseLevel: readInteger(
      record.lowerPrestigeBaseLevel,
      "diceBalance.lowerPrestigeBaseLevel",
      1,
    ),
    banStep: readInteger(record.banStep, "diceBalance.banStep", 1),
    levelUpReward: readInteger(record.levelUpReward, "diceBalance.levelUpReward", 0),
    maxRollPassCount: readInteger(record.maxRollPassCount, "diceBalance.maxRollPassCount", 1),
    charge: {
      startAfterMinutes: readInteger(
        charge.startAfterMinutes,
        "diceBalance.charge.startAfterMinutes",
        0,
      ),
      maxMultiplier: readInteger(charge.maxMultiplier, "diceBalance.charge.maxMultiplier", 1),
    },
    pvp: {
      challengeExpireMinutes: readInteger(
        pvp.challengeExpireMinutes,
        "diceBalance.pvp.challengeExpireMinutes",
        1,
      ),
      loserLockoutBaseMinutes: readInteger(
        pvp.loserLockoutBaseMinutes,
        "diceBalance.pvp.loserLockoutBaseMinutes",
        1,
      ),
      winnerBuffBaseMinutes: readInteger(
        pvp.winnerBuffBaseMinutes,
        "diceBalance.pvp.winnerBuffBaseMinutes",
        1,
      ),
    },
    randomEvents: {
      claimWindowDurationMultiplier: readFiniteNumber(
        randomEvents.claimWindowDurationMultiplier,
        "diceBalance.randomEvents.claimWindowDurationMultiplier",
      ),
      variety: readVarietyConfig(randomEvents.variety, "diceBalance.randomEvents.variety"),
    },
    raids: {
      reward: readRaidRewardConfig(raids.reward, "diceBalance.raids.reward"),
      bossNames: readRaidBossNamesConfig(raids.bossNames, "diceBalance.raids.bossNames"),
      bossBalance: readRaidBossBalanceConfig(raids.bossBalance, "diceBalance.raids.bossBalance"),
    },
  };

  if (parsed.prestigeSides.length < 2) {
    throw new Error("diceBalance.prestigeSides must include at least two entries.");
  }

  return parsed;
};

export const parseDiceCasinoData = (value: unknown): DiceCasinoData => {
  const record = assertRecord(value, "casinoV1");
  const bet = assertRecord(record.bet, "casinoV1.bet");
  const exactRoll = assertRecord(record.exactRoll, "casinoV1.exactRoll");
  const pushYourLuck = assertRecord(record.pushYourLuck, "casinoV1.pushYourLuck");
  const blackjack = assertRecord(record.blackjack, "casinoV1.blackjack");
  const dicePoker = assertRecord(record.dicePoker, "casinoV1.dicePoker");
  const dicePokerPayoutMultipliers = assertRecord(
    dicePoker.payoutMultipliers,
    "casinoV1.dicePoker.payoutMultipliers",
  );

  if (!Array.isArray(pushYourLuck.payouts)) {
    throw new Error("casinoV1.pushYourLuck.payouts must be an array.");
  }

  const parsed: DiceCasinoData = {
    bet: {
      min: readInteger(bet.min, "casinoV1.bet.min", 1),
      max: readInteger(bet.max, "casinoV1.bet.max", 1),
      default: readInteger(bet.default, "casinoV1.bet.default", 1),
      sessionTimeoutMinutes: readInteger(
        bet.sessionTimeoutMinutes,
        "casinoV1.bet.sessionTimeoutMinutes",
        1,
      ),
    },
    exactRoll: {
      dieSides: readInteger(exactRoll.dieSides, "casinoV1.exactRoll.dieSides", 2),
      highLowLowMaxFace: readInteger(
        exactRoll.highLowLowMaxFace,
        "casinoV1.exactRoll.highLowLowMaxFace",
        1,
      ),
      facePayout: readCasinoPayoutRatio(exactRoll.facePayout, "casinoV1.exactRoll.facePayout"),
      highLowPayout: readCasinoPayoutRatio(
        exactRoll.highLowPayout,
        "casinoV1.exactRoll.highLowPayout",
      ),
    },
    pushYourLuck: {
      dieSides: readInteger(pushYourLuck.dieSides, "casinoV1.pushYourLuck.dieSides", 2),
      cashoutStartsAtUniqueFaces: readInteger(
        pushYourLuck.cashoutStartsAtUniqueFaces,
        "casinoV1.pushYourLuck.cashoutStartsAtUniqueFaces",
        1,
      ),
      autoCashoutAtUniqueFaces: readInteger(
        pushYourLuck.autoCashoutAtUniqueFaces,
        "casinoV1.pushYourLuck.autoCashoutAtUniqueFaces",
        1,
      ),
      payouts: pushYourLuck.payouts.map((entry, index) =>
        readCasinoPushYourLuckPayout(entry, `casinoV1.pushYourLuck.payouts[${index}]`),
      ),
    },
    blackjack: {
      dieSides: readInteger(blackjack.dieSides, "casinoV1.blackjack.dieSides", 2),
      initialCardsPerHand: readInteger(
        blackjack.initialCardsPerHand,
        "casinoV1.blackjack.initialCardsPerHand",
        2,
      ),
      dealerStandOnTotal: readInteger(
        blackjack.dealerStandOnTotal,
        "casinoV1.blackjack.dealerStandOnTotal",
        2,
      ),
      naturalPayout: readCasinoPayoutRatio(
        blackjack.naturalPayout,
        "casinoV1.blackjack.naturalPayout",
      ),
      winPayoutMultiplier: readInteger(
        blackjack.winPayoutMultiplier,
        "casinoV1.blackjack.winPayoutMultiplier",
        1,
      ),
    },
    dicePoker: {
      payoutMultipliers: {
        fiveOfAKind: readInteger(
          dicePokerPayoutMultipliers.fiveOfAKind,
          "casinoV1.dicePoker.payoutMultipliers.fiveOfAKind",
          1,
        ),
        fourOfAKind: readInteger(
          dicePokerPayoutMultipliers.fourOfAKind,
          "casinoV1.dicePoker.payoutMultipliers.fourOfAKind",
          1,
        ),
        fullHouse: readInteger(
          dicePokerPayoutMultipliers.fullHouse,
          "casinoV1.dicePoker.payoutMultipliers.fullHouse",
          1,
        ),
        straight: readInteger(
          dicePokerPayoutMultipliers.straight,
          "casinoV1.dicePoker.payoutMultipliers.straight",
          1,
        ),
      },
    },
  };

  if (parsed.bet.min > parsed.bet.default || parsed.bet.default > parsed.bet.max) {
    throw new Error("casinoV1.bet must satisfy min <= default <= max.");
  }

  if (parsed.exactRoll.highLowLowMaxFace >= parsed.exactRoll.dieSides) {
    throw new Error("casinoV1.exactRoll.highLowLowMaxFace must be between 1 and dieSides - 1.");
  }

  if (parsed.exactRoll.dieSides > 8) {
    throw new Error(
      "casinoV1.exactRoll.dieSides must be <= 8 to fit Discord component row limits.",
    );
  }

  if (
    parsed.pushYourLuck.cashoutStartsAtUniqueFaces > parsed.pushYourLuck.autoCashoutAtUniqueFaces
  ) {
    throw new Error(
      "casinoV1.pushYourLuck.cashoutStartsAtUniqueFaces must be <= autoCashoutAtUniqueFaces.",
    );
  }

  if (parsed.pushYourLuck.autoCashoutAtUniqueFaces > parsed.pushYourLuck.dieSides) {
    throw new Error("casinoV1.pushYourLuck.autoCashoutAtUniqueFaces must be <= dieSides.");
  }

  const expectedUniqueFaces: number[] = [];
  for (
    let uniqueFaces = parsed.pushYourLuck.cashoutStartsAtUniqueFaces;
    uniqueFaces <= parsed.pushYourLuck.autoCashoutAtUniqueFaces;
    uniqueFaces += 1
  ) {
    expectedUniqueFaces.push(uniqueFaces);
  }

  const actualUniqueFaces = parsed.pushYourLuck.payouts.map((entry) => entry.uniqueFaces);
  const sortedUniqueFaces = [...actualUniqueFaces].sort((left, right) => left - right);
  if (sortedUniqueFaces.some((value, index) => value !== actualUniqueFaces[index])) {
    throw new Error("casinoV1.pushYourLuck.payouts must be sorted by uniqueFaces.");
  }

  const uniqueFaceSet = new Set(actualUniqueFaces);
  if (uniqueFaceSet.size !== actualUniqueFaces.length) {
    throw new Error("casinoV1.pushYourLuck.payouts must not contain duplicate uniqueFaces.");
  }

  if (
    expectedUniqueFaces.length !== actualUniqueFaces.length ||
    expectedUniqueFaces.some((value, index) => value !== actualUniqueFaces[index])
  ) {
    throw new Error(
      "casinoV1.pushYourLuck.payouts must cover every uniqueFaces value from cashoutStartsAtUniqueFaces through autoCashoutAtUniqueFaces.",
    );
  }

  return parsed;
};

export const parseRandomEventScenarios = (value: unknown): RandomEventScenario[] => {
  if (!Array.isArray(value)) {
    throw new Error("Random event content must be an array.");
  }

  const parsed = value.map((entry, index) =>
    readRandomEventScenario(entry, `randomEventsV1[${index}]`),
  );
  validateParsedRandomEventScenarios(parsed);
  return parsed;
};

export const parseDiceItems = (value: unknown): DiceItemData[] => {
  if (!Array.isArray(value)) {
    throw new Error("Dice items data must be an array.");
  }

  const parsed = value.map((entry, index) => {
    const record = assertRecord(entry, `itemsV1[${index}]`);
    return {
      id: readNonEmptyString(record.id, `itemsV1[${index}].id`),
      name: readNonEmptyString(record.name, `itemsV1[${index}].name`),
      description: readNonEmptyString(record.description, `itemsV1[${index}].description`),
      pricePips: readInteger(record.pricePips, `itemsV1[${index}].pricePips`, 0),
      consumable: readBoolean(record.consumable, `itemsV1[${index}].consumable`),
      effect: readDiceItemEffect(record.effect, `itemsV1[${index}].effect`),
    };
  });

  const ids = new Set<string>();
  for (const item of parsed) {
    if (ids.has(item.id)) {
      throw new Error(`Duplicate item id: ${item.id}`);
    }

    if (item.effect.type === "auto-roll-session") {
      if (item.effect.durationSeconds < item.effect.intervalSeconds) {
        throw new Error(`Auto-roll item ${item.id} must have durationSeconds >= intervalSeconds.`);
      }
    }

    ids.add(item.id);
  }

  return parsed;
};
