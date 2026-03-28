import type {
  DiceAchievementData,
  DiceAchievementCategory,
  DiceAchievementManualAward,
  DiceCasinoData,
  DiceCasinoPayoutRatio,
  DiceCasinoPushYourLuckPayoutData,
  DiceAchievementRule,
  DiceBalanceData,
  DiceContractData,
  DiceContractDifficulty,
  DiceContractOfferData,
  DiceContractObjectiveData,
  DiceContractObjectiveType,
  DiceContractRewardData,
  DiceContractsCadenceData,
  DiceContractsCadenceMetadataData,
  DiceContractsData,
  DiceContractsDifficultyData,
  DiceContractsPanelData,
  DicePvpData,
  DiceItemData,
  DiceItemEffect,
  DiceItemRepeatablePricing,
  IntroPostsV1Data,
  DiceBalanceVarietyConfig,
  DiceRandomEventBalanceData,
  DiceWorldBossBossBalanceData,
  DiceWorldBossBossNamesData,
  DiceWorldBossData,
  DiceWorldBossParticipantStrengthData,
  DiceWorldBossPipRewardFormulaData,
  DiceWorldBossPipRewardTierData,
  DiceWorldBossRewardData,
} from "./types";
import {
  validateRandomEventScenarios,
  type RandomEventClaimActivityTemplates,
  type RandomEventEffect,
  type RandomEventFlow,
  type RandomEventOutcome,
  type RandomEventOutcomeResolution,
  type RandomEventParticipantRewardPolicy,
  type RandomEventRetryPolicy,
  type RandomEventScenario,
  type RandomEventStage,
  type RandomEventTimeoutResolution,
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
import {
  assertDiscordTextLength,
  discordButtonLabelCharacterLimit,
  discordEmbedDescriptionCharacterLimit,
  discordEmbedTitleCharacterLimit,
  discordMessageCharacterLimit,
  discordStringSelectOptionLabelCharacterLimit,
} from "../shared/discord";

type UnknownRecord = Record<string, unknown>;

const rarityTiers = ["common", "uncommon", "rare", "epic", "legendary"] as const;
const claimPolicies = ["first-click", "multi-user"] as const;
const randomEventOutcomeResolutions = [
  "resolve-success",
  "resolve-failure",
  "keep-open-failure",
] as const;
const randomEventRetryPolicies = ["once-per-user", "allow-retry"] as const;
const randomEventParticipantRewardPolicies = ["all-equal", "finisher-bonus"] as const;
const randomEventTimeoutResolutions = [
  "resolve-current-stage",
  "cash-out-current-pot",
  "expire-event",
] as const;
const achievementCategories = [
  "progression",
  "roll",
  "casino",
  "pvp",
  "random-events",
  "world-boss",
  "items",
  "meta",
] as const;
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
const contractObjectiveTypes = [
  "roll_count",
  "pvp_win_count",
  "casino_game_count",
  "world_boss_join_count",
] as const;
const contractDifficulties = ["simple", "serious", "brutal"] as const;
const minimumOffersPerDifficultyPool = 1;
const introPostContentMaxLength = discordMessageCharacterLimit;
const randomEventTemplateVariablePattern = /\$\{([a-zA-Z0-9_]+)\}/g;

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

const readOptionalNonEmptyString = (value: unknown, label: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readNonEmptyString(value, label);
};

const readFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
};

const readPositiveFiniteNumber = (value: unknown, label: string): number => {
  const parsed = readFiniteNumber(value, label);
  if (parsed <= 0) {
    throw new Error(`${label} must be > 0.`);
  }

  return parsed;
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

const readOptionalInteger = (
  value: unknown,
  label: string,
  minValue: number = Number.MIN_SAFE_INTEGER,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readInteger(value, label, minValue);
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

const getRandomEventRarityLabel = (rarity: RandomEventRarityTier): string => {
  switch (rarity) {
    case "common":
      return "Common Event";
    case "uncommon":
      return "Uncommon Event";
    case "rare":
      return "Rare Event";
    case "epic":
      return "Epic Event";
    case "legendary":
      return "Legendary Event";
  }
};

const getLongestString = (values: readonly string[]): string => {
  return values.reduce((longest, value) => (value.length > longest.length ? value : longest), "");
};

const renderRandomEventTemplateWithLongestValues = (
  template: string,
  variables: Record<string, string[]>,
): string => {
  return template.replace(randomEventTemplateVariablePattern, (match, key: string) => {
    return getLongestString(variables[key] ?? []) || match;
  });
};

const collectScenarioRenderVariables = (
  scenario: RandomEventScenario,
): Record<string, string[]> => {
  const collected: Record<string, string[]> = {
    ...(scenario.textVariables ?? {}),
  };
  const referencedKeys = new Set<string>();

  const flowTemplates: string[] = [];
  if (scenario.flow?.type === "stake-offer") {
    flowTemplates.push(
      scenario.flow.acceptLabel ?? scenario.claimLabel,
      scenario.flow.declineLabel,
      scenario.flow.declineMessage,
    );
  }

  if (
    scenario.flow?.type === "solo-ladder" ||
    scenario.flow?.type === "solo-push-your-luck" ||
    scenario.flow?.type === "group-meter"
  ) {
    for (const stage of scenario.flow.stages) {
      for (const template of [
        stage.prompt,
        stage.actionLabel,
        stage.successMessage,
        stage.failureMessage,
      ]) {
        if (typeof template === "string") {
          flowTemplates.push(template);
        }
      }
    }
  }

  for (const template of [scenario.title, scenario.prompt, scenario.claimLabel, ...flowTemplates]) {
    for (const match of template.matchAll(randomEventTemplateVariablePattern)) {
      const key = match[1];
      if (key) {
        referencedKeys.add(key);
      }
    }
  }

  for (const outcome of scenario.outcomes) {
    for (const key of referencedKeys) {
      const values = outcome.textVariables?.[key];
      if (!values || values.length < 1) {
        continue;
      }

      collected[key] = [...new Set([...(collected[key] ?? []), ...values])];
    }
  }

  return collected;
};

const collectOutcomeRenderVariables = (
  scenario: RandomEventScenario,
  outcome: RandomEventOutcome,
) => {
  return {
    ...(scenario.textVariables ?? {}),
    ...(outcome.textVariables ?? {}),
  };
};

const getInventoryOwnershipLabel = (item: DiceItemData): string => {
  if (isPassiveDiceItemEffect(item.effect)) {
    return item.repeatablePricing
      ? "Permanent passive upgrade. Stacks."
      : "Permanent passive upgrade.";
  }

  return item.consumable ? "Consumable." : "Permanent collectible.";
};

const buildSingleItemInventoryPreview = (item: DiceItemData): string => {
  return [
    "Dice inventory for <@123456789012345678>:",
    "Use buttons below to consume items.",
    "",
    `**${item.name}**`,
    "Owned: 1.",
    item.description,
    getInventoryOwnershipLabel(item),
  ].join("\n");
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

const readAchievementCategory = (value: unknown, label: string): DiceAchievementCategory => {
  const parsed = readNonEmptyString(value, label);
  if (!achievementCategories.includes(parsed as DiceAchievementCategory)) {
    throw new Error(`${label} must be one of ${achievementCategories.join(", ")}.`);
  }

  return parsed as DiceAchievementCategory;
};

const readRandomEventOutcomeResolution = (
  value: unknown,
  label: string,
): RandomEventOutcomeResolution => {
  const parsed = readNonEmptyString(value, label);
  if (!randomEventOutcomeResolutions.includes(parsed as RandomEventOutcomeResolution)) {
    throw new Error(`${label} must be one of ${randomEventOutcomeResolutions.join(", ")}.`);
  }

  return parsed as RandomEventOutcomeResolution;
};

const readRandomEventRetryPolicy = (
  value: unknown,
  label: string,
): RandomEventRetryPolicy | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = readNonEmptyString(value, label);
  if (!randomEventRetryPolicies.includes(parsed as RandomEventRetryPolicy)) {
    throw new Error(`${label} must be one of ${randomEventRetryPolicies.join(", ")}.`);
  }

  return parsed as RandomEventRetryPolicy;
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
    const minAmount = readInteger(record.minAmount, `${label}.minAmount`, 0);
    const maxAmount = readInteger(record.maxAmount, `${label}.maxAmount`, 0);
    if (minAmount > maxAmount) {
      throw new Error(`${label}.minAmount must be less than or equal to ${label}.maxAmount.`);
    }

    return {
      type,
      minAmount,
      maxAmount,
    };
  }

  if (type === "consumable-item") {
    return {
      type,
      itemId: readNonEmptyString(record.itemId, `${label}.itemId`),
      quantity: readOptionalInteger(record.quantity, `${label}.quantity`, 1) ?? 1,
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
    resolution: readRandomEventOutcomeResolution(record.resolution, `${label}.resolution`),
    message: readNonEmptyString(record.message, `${label}.message`),
    effects: record.effects.map((entry, index) =>
      readRandomEventEffect(entry, `${label}.effects[${index}]`),
    ),
    textVariables: readTextVariables(record.textVariables, `${label}.textVariables`),
  };
};

const readRandomEventParticipantRewardPolicy = (
  value: unknown,
  label: string,
): RandomEventParticipantRewardPolicy | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = readNonEmptyString(value, label);
  if (
    !randomEventParticipantRewardPolicies.includes(parsed as RandomEventParticipantRewardPolicy)
  ) {
    throw new Error(`${label} must be one of ${randomEventParticipantRewardPolicies.join(", ")}.`);
  }

  return parsed as RandomEventParticipantRewardPolicy;
};

const readRandomEventTimeoutResolution = (
  value: unknown,
  label: string,
): RandomEventTimeoutResolution | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = readNonEmptyString(value, label);
  if (!randomEventTimeoutResolutions.includes(parsed as RandomEventTimeoutResolution)) {
    throw new Error(`${label} must be one of ${randomEventTimeoutResolutions.join(", ")}.`);
  }

  return parsed as RandomEventTimeoutResolution;
};

const readRandomEventStage = (value: unknown, label: string): RandomEventStage => {
  const record = assertRecord(value, label);
  if (!Array.isArray(record.successEffects)) {
    throw new Error(`${label}.successEffects must be an array.`);
  }

  if (record.failureEffects !== undefined && !Array.isArray(record.failureEffects)) {
    throw new Error(`${label}.failureEffects must be an array.`);
  }

  const failureResolution =
    record.failureResolution === undefined
      ? undefined
      : readNonEmptyString(record.failureResolution, `${label}.failureResolution`);
  if (
    failureResolution !== undefined &&
    failureResolution !== "resolve-event" &&
    failureResolution !== "keep-open"
  ) {
    throw new Error(`${label}.failureResolution must be "resolve-event" or "keep-open".`);
  }

  return {
    id: readNonEmptyString(record.id, `${label}.id`),
    label: readNonEmptyString(record.label, `${label}.label`),
    prompt: readOptionalNonEmptyString(record.prompt, `${label}.prompt`),
    actionLabel: readOptionalNonEmptyString(record.actionLabel, `${label}.actionLabel`),
    rollChallenge: readRollChallengeDefinition(record.rollChallenge, `${label}.rollChallenge`),
    successMessage: readNonEmptyString(record.successMessage, `${label}.successMessage`),
    successEffects: record.successEffects.map((entry, index) =>
      readRandomEventEffect(entry, `${label}.successEffects[${index}]`),
    ),
    failureMessage: readOptionalNonEmptyString(record.failureMessage, `${label}.failureMessage`),
    failureEffects:
      record.failureEffects === undefined
        ? undefined
        : record.failureEffects.map((entry, index) =>
            readRandomEventEffect(entry, `${label}.failureEffects[${index}]`),
          ),
    failureResolution,
    requiredSuccesses: readOptionalInteger(
      record.requiredSuccesses,
      `${label}.requiredSuccesses`,
      2,
    ),
  };
};

const readRandomEventFlow = (value: unknown, label: string): RandomEventFlow | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const record = assertRecord(value, label);
  const type = readNonEmptyString(record.type, `${label}.type`);

  if (type === "single-resolution") {
    return { type };
  }

  if (type === "solo-ladder" || type === "solo-push-your-luck" || type === "group-meter") {
    if (!Array.isArray(record.stages)) {
      throw new Error(`${label}.stages must be an array.`);
    }

    const stages = record.stages.map((entry, index) =>
      readRandomEventStage(entry, `${label}.stages[${index}]`),
    );
    const timeoutResolution = readRandomEventTimeoutResolution(
      record.timeoutResolution,
      `${label}.timeoutResolution`,
    );

    if (type === "solo-ladder") {
      if (timeoutResolution && timeoutResolution !== "resolve-current-stage") {
        throw new Error(
          `${label}.timeoutResolution must be "resolve-current-stage" for solo-ladder flows.`,
        );
      }

      return {
        type,
        stages,
        timeoutResolution,
      };
    }

    if (type === "solo-push-your-luck") {
      if (timeoutResolution && timeoutResolution !== "cash-out-current-pot") {
        throw new Error(
          `${label}.timeoutResolution must be "cash-out-current-pot" for solo-push-your-luck flows.`,
        );
      }

      return {
        type,
        stages,
        timeoutResolution,
      };
    }

    if (timeoutResolution && timeoutResolution !== "resolve-current-stage") {
      throw new Error(
        `${label}.timeoutResolution must be "resolve-current-stage" for group-meter flows.`,
      );
    }

    return {
      type,
      stages,
      timeoutResolution,
      participantRewardPolicy: readRandomEventParticipantRewardPolicy(
        record.participantRewardPolicy,
        `${label}.participantRewardPolicy`,
      ),
    };
  }

  if (type === "stake-offer") {
    return {
      type,
      stakePips: readInteger(record.stakePips, `${label}.stakePips`, 1),
      acceptLabel: readOptionalNonEmptyString(record.acceptLabel, `${label}.acceptLabel`),
      declineLabel: readNonEmptyString(record.declineLabel, `${label}.declineLabel`),
      declineMessage: readNonEmptyString(record.declineMessage, `${label}.declineMessage`),
    };
  }

  throw new Error(`${label}.type is invalid.`);
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
    requiredReadyCount: readOptionalInteger(
      record.requiredReadyCount,
      `${label}.requiredReadyCount`,
      2,
    ),
    weight: readOptionalFiniteNumber(record.weight, `${label}.weight`),
    retryPolicy: readRandomEventRetryPolicy(record.retryPolicy, `${label}.retryPolicy`),
    flow: readRandomEventFlow(record.flow, `${label}.flow`),
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

  if (type === "passive-extra-shield-on-umbrella") {
    return {
      type,
      extraCharges: readInteger(record.extraCharges, `${label}.extraCharges`, 1),
    };
  }

  if (type === "passive-pvp-loser-lockout-reduction") {
    return {
      type,
      reductionPercent: readFiniteNumberAtLeast(
        record.reductionPercent,
        `${label}.reductionPercent`,
        0,
      ),
      minimumMinutes: readInteger(record.minimumMinutes, `${label}.minimumMinutes`, 1),
    };
  }

  if (type === "passive-cleanse-grants-negative-effect-shield") {
    return {
      type,
      charges: readInteger(record.charges, `${label}.charges`, 1),
    };
  }

  if (type === "passive-extra-ban-slot") {
    return {
      type,
      extraSlots: readInteger(record.extraSlots, `${label}.extraSlots`, 1),
    };
  }

  if (type === "passive-pip-reward-bonus") {
    return {
      type,
      bonusPercent: readInteger(record.bonusPercent, `${label}.bonusPercent`, 1),
    };
  }

  if (type === "passive-personal-charge-unlock") {
    return {
      type,
      minutesPerMultiplier: readFiniteNumberAtLeast(
        record.minutesPerMultiplier,
        `${label}.minutesPerMultiplier`,
        0.01,
      ),
      maxMultiplier: readInteger(record.maxMultiplier, `${label}.maxMultiplier`, 1),
    };
  }

  if (type === "passive-personal-charge-speed-bonus") {
    return {
      type,
      fasterPercent: readFiniteNumberAtLeast(record.fasterPercent, `${label}.fasterPercent`, 0),
    };
  }

  if (type === "passive-personal-charge-cap-bonus") {
    return {
      type,
      extraMaxMultiplier: readInteger(record.extraMaxMultiplier, `${label}.extraMaxMultiplier`, 1),
    };
  }

  throw new Error(`${label}.type is invalid.`);
};

const isPassiveDiceItemEffect = (effect: DiceItemEffect): boolean => {
  return (
    effect.type === "passive-extra-shield-on-umbrella" ||
    effect.type === "passive-pvp-loser-lockout-reduction" ||
    effect.type === "passive-cleanse-grants-negative-effect-shield" ||
    effect.type === "passive-extra-ban-slot" ||
    effect.type === "passive-pip-reward-bonus" ||
    effect.type === "passive-personal-charge-unlock" ||
    effect.type === "passive-personal-charge-speed-bonus" ||
    effect.type === "passive-personal-charge-cap-bonus"
  );
};

const isRepeatablePassiveDiceItemEffect = (effect: DiceItemEffect): boolean => {
  return (
    effect.type === "passive-extra-ban-slot" ||
    effect.type === "passive-pip-reward-bonus" ||
    effect.type === "passive-personal-charge-speed-bonus" ||
    effect.type === "passive-personal-charge-cap-bonus"
  );
};

const readDiceItemRepeatablePricing = (
  value: unknown,
  label: string,
): DiceItemRepeatablePricing => {
  const record = assertRecord(value, label);
  return {
    priceIncreasePipsPerOwned: readInteger(
      record.priceIncreasePipsPerOwned,
      `${label}.priceIncreasePipsPerOwned`,
      1,
    ),
  };
};

const validateDiceItemDiscordText = (item: DiceItemData, label: string): void => {
  assertDiscordTextLength(item.name, `${label}.name`, discordStringSelectOptionLabelCharacterLimit);

  if (item.consumable) {
    assertDiscordTextLength(
      `Use ${item.name}`,
      `${label}.name as used in inventory buttons`,
      discordButtonLabelCharacterLimit,
    );
  }

  assertDiscordTextLength(
    item.description,
    `${label}.description`,
    discordEmbedDescriptionCharacterLimit,
  );
  assertDiscordTextLength(
    buildSingleItemInventoryPreview(item),
    `${label}.description as rendered in a single-item /inventory page`,
    discordMessageCharacterLimit,
  );
};

const validateRandomEventScenarioDiscordText = (
  scenario: RandomEventScenario,
  label: string,
): void => {
  const flow = scenario.flow;
  const scenarioRenderVariables = collectScenarioRenderVariables(scenario);
  const renderedTitle = renderRandomEventTemplateWithLongestValues(
    scenario.title,
    scenarioRenderVariables,
  );
  const renderedPrompt = renderRandomEventTemplateWithLongestValues(
    scenario.prompt,
    scenarioRenderVariables,
  );
  const renderedClaimLabel = renderRandomEventTemplateWithLongestValues(
    scenario.claimLabel,
    scenarioRenderVariables,
  );

  assertDiscordTextLength(
    `${getRandomEventRarityLabel(scenario.rarity)} • ${renderedTitle}`,
    `${label}.title as rendered in Discord`,
    discordEmbedTitleCharacterLimit,
  );
  assertDiscordTextLength(
    renderedPrompt,
    `${label}.prompt as rendered in Discord`,
    discordEmbedDescriptionCharacterLimit,
  );
  assertDiscordTextLength(
    renderedClaimLabel,
    `${label}.claimLabel as rendered in Discord`,
    discordButtonLabelCharacterLimit,
  );

  if (flow?.type === "stake-offer") {
    const renderedAcceptLabel = renderRandomEventTemplateWithLongestValues(
      flow.acceptLabel ?? scenario.claimLabel,
      scenarioRenderVariables,
    );
    const renderedDeclineLabel = renderRandomEventTemplateWithLongestValues(
      flow.declineLabel,
      scenarioRenderVariables,
    );

    assertDiscordTextLength(
      renderedAcceptLabel,
      `${label}.flow.acceptLabel as rendered in Discord`,
      discordButtonLabelCharacterLimit,
    );
    assertDiscordTextLength(
      renderedDeclineLabel,
      `${label}.flow.declineLabel as rendered in Discord`,
      discordButtonLabelCharacterLimit,
    );
    assertDiscordTextLength(
      renderRandomEventTemplateWithLongestValues(flow.declineMessage, scenarioRenderVariables),
      `${label}.flow.declineMessage as rendered in Discord`,
      discordEmbedDescriptionCharacterLimit,
    );
  }

  if (
    flow?.type === "solo-ladder" ||
    flow?.type === "solo-push-your-luck" ||
    flow?.type === "group-meter"
  ) {
    flow.stages.forEach((stage, stageIndex) => {
      assertDiscordTextLength(
        renderRandomEventTemplateWithLongestValues(
          stage.prompt ?? stage.successMessage,
          scenarioRenderVariables,
        ),
        `${label}.flow.stages[${stageIndex}].prompt as rendered in Discord`,
        discordEmbedDescriptionCharacterLimit,
      );
      assertDiscordTextLength(
        renderRandomEventTemplateWithLongestValues(
          stage.actionLabel ?? scenario.claimLabel,
          scenarioRenderVariables,
        ),
        `${label}.flow.stages[${stageIndex}].actionLabel as rendered in Discord`,
        discordButtonLabelCharacterLimit,
      );
      assertDiscordTextLength(
        renderRandomEventTemplateWithLongestValues(stage.successMessage, scenarioRenderVariables),
        `${label}.flow.stages[${stageIndex}].successMessage as rendered in Discord`,
        discordEmbedDescriptionCharacterLimit,
      );
      if (stage.failureMessage) {
        assertDiscordTextLength(
          renderRandomEventTemplateWithLongestValues(stage.failureMessage, scenarioRenderVariables),
          `${label}.flow.stages[${stageIndex}].failureMessage as rendered in Discord`,
          discordEmbedDescriptionCharacterLimit,
        );
      }
    });
  }

  scenario.outcomes.forEach((outcome, outcomeIndex) => {
    const renderedOutcomeMessage = renderRandomEventTemplateWithLongestValues(
      outcome.message,
      collectOutcomeRenderVariables(scenario, outcome),
    );

    assertDiscordTextLength(
      renderedOutcomeMessage,
      `${label}.outcomes[${outcomeIndex}].message as rendered in Discord`,
      discordEmbedDescriptionCharacterLimit,
    );
  });
};

const buildLongestWorldBossName = (worldBoss: DiceWorldBossData): string => {
  const prefix = getLongestString(worldBoss.bossNames.prefixes);
  const suffix = getLongestString(worldBoss.bossNames.suffixes);
  return `${prefix} ${suffix}`.trim();
};

const validateWorldBossDiscordText = (worldBoss: DiceWorldBossData): void => {
  const bossName = buildLongestWorldBossName(worldBoss);
  const maxBossLevel = worldBoss.bossBalance.maxBossLevel;

  assertDiscordTextLength(
    `${bossName} - Lv.${maxBossLevel}`,
    "worldBoss.bossNames as rendered in the active World Boss title",
    discordEmbedTitleCharacterLimit,
  );
  assertDiscordTextLength(
    `World Boss cleared - ${bossName} Lv.${maxBossLevel}`,
    "worldBoss.bossNames as rendered in the resolved World Boss title",
    discordEmbedTitleCharacterLimit,
  );
  assertDiscordTextLength(
    `World Boss failed - ${bossName} Lv.${maxBossLevel}`,
    "worldBoss.bossNames as rendered in the failed World Boss title",
    discordEmbedTitleCharacterLimit,
  );
};

const readContractObjectiveType = (value: unknown, label: string): DiceContractObjectiveType => {
  const parsed = readNonEmptyString(value, label);
  if (!contractObjectiveTypes.includes(parsed as DiceContractObjectiveType)) {
    throw new Error(`${label} must be one of ${contractObjectiveTypes.join(", ")}.`);
  }

  return parsed as DiceContractObjectiveType;
};

const readContractObjective = (value: unknown, label: string): DiceContractObjectiveData => {
  const record = assertRecord(value, label);
  return {
    type: readContractObjectiveType(record.type, `${label}.type`),
    requiredCount: readInteger(record.requiredCount, `${label}.requiredCount`, 1),
  };
};

const readContractOffer = (value: unknown, label: string): DiceContractOfferData => {
  const record = assertRecord(value, label);
  if (record.reward !== undefined) {
    throw new Error(`${label}.reward is not supported. Set rewardPips on the difficulty instead.`);
  }

  return {
    id: readNonEmptyString(record.id, `${label}.id`),
    title: readNonEmptyString(record.title, `${label}.title`),
    description: readNonEmptyString(record.description, `${label}.description`),
    objective: readContractObjective(record.objective, `${label}.objective`),
  };
};

const createContractReward = (rewardPips: number): DiceContractRewardData => {
  return {
    pips: rewardPips,
  };
};

const applyContractReward = (
  offer: DiceContractOfferData,
  rewardPips: number,
): DiceContractData => {
  return {
    ...offer,
    reward: createContractReward(rewardPips),
  };
};

const buildContractPreview = (contract: DiceContractData, cadenceLabel: string): string => {
  return [
    `**${cadenceLabel} Contract**`,
    contract.title,
    contract.description,
    `Reward: ${contract.reward.pips} pips`,
  ].join("\n");
};

const validateContractDiscordText = (
  contract: DiceContractData,
  label: string,
  cadenceLabel: string,
): void => {
  assertDiscordTextLength(
    contract.title,
    `${label}.title as rendered in Discord`,
    discordEmbedTitleCharacterLimit,
  );
  assertDiscordTextLength(
    contract.description,
    `${label}.description as rendered in Discord`,
    discordEmbedDescriptionCharacterLimit,
  );
  assertDiscordTextLength(
    buildContractPreview(contract, cadenceLabel),
    `${label} as rendered in /contracts`,
    discordMessageCharacterLimit,
  );
};

const readContractDifficulty = (
  value: unknown,
  label: string,
  cadenceLabel: string,
): DiceContractsDifficultyData => {
  const record = assertRecord(value, label);
  const rewardPips = readInteger(record.rewardPips, `${label}.rewardPips`, 1);

  if (!Array.isArray(record.initialOffers)) {
    throw new Error(`${label}.initialOffers must be an array.`);
  }
  if (!Array.isArray(record.refillOffers)) {
    throw new Error(`${label}.refillOffers must be an array.`);
  }

  if (record.initialOffers.length < minimumOffersPerDifficultyPool) {
    throw new Error(
      `${label}.initialOffers must include at least ${minimumOffersPerDifficultyPool} offer.`,
    );
  }
  if (record.refillOffers.length < minimumOffersPerDifficultyPool) {
    throw new Error(
      `${label}.refillOffers must include at least ${minimumOffersPerDifficultyPool} offer.`,
    );
  }

  const initialOffers = record.initialOffers.map((entry, index) =>
    applyContractReward(readContractOffer(entry, `${label}.initialOffers[${index}]`), rewardPips),
  );
  const refillOffers = record.refillOffers.map((entry, index) =>
    applyContractReward(readContractOffer(entry, `${label}.refillOffers[${index}]`), rewardPips),
  );

  initialOffers.forEach((contract, index) =>
    validateContractDiscordText(contract, `${label}.initialOffers[${index}]`, cadenceLabel),
  );
  refillOffers.forEach((contract, index) =>
    validateContractDiscordText(contract, `${label}.refillOffers[${index}]`, cadenceLabel),
  );

  return {
    label: readNonEmptyString(record.label, `${label}.label`),
    rewardPips,
    initialOffers,
    refillOffers,
  };
};

const readContractsCadenceMetadata = (
  value: unknown,
  label: string,
): DiceContractsCadenceMetadataData => {
  const record = assertRecord(value, label);
  const cadenceLabel = readNonEmptyString(record.label, `${label}.label`);
  const difficultiesRecord = assertRecord(record.difficulties, `${label}.difficulties`);

  const difficulties = Object.fromEntries(
    contractDifficulties.map((difficulty) => [
      difficulty,
      readContractDifficulty(
        difficultiesRecord[difficulty],
        `${label}.difficulties.${difficulty}`,
        cadenceLabel,
      ),
    ]),
  ) as Record<DiceContractDifficulty, DiceContractsDifficultyData>;

  const chooserTitle = readNonEmptyString(record.chooserTitle, `${label}.chooserTitle`);
  const chooserDescription = readNonEmptyString(
    record.chooserDescription,
    `${label}.chooserDescription`,
  );

  assertDiscordTextLength(
    cadenceLabel,
    `${label}.label`,
    discordStringSelectOptionLabelCharacterLimit,
  );
  assertDiscordTextLength(chooserTitle, `${label}.chooserTitle`, discordEmbedTitleCharacterLimit);
  assertDiscordTextLength(
    chooserDescription,
    `${label}.chooserDescription`,
    discordEmbedDescriptionCharacterLimit,
  );

  return {
    label: cadenceLabel,
    chooserTitle,
    chooserDescription,
    difficulties,
  };
};

const buildContractsCadenceData = (
  metadata: DiceContractsCadenceMetadataData,
): DiceContractsCadenceData => {
  const allContracts = contractDifficulties.flatMap((difficulty) => {
    const entry = metadata.difficulties[difficulty];
    return [...entry.initialOffers, ...entry.refillOffers];
  });

  return Object.assign(allContracts, metadata);
};

const assertDistinctContractIds = (contracts: DiceContractData[], seenIds: Set<string>): void => {
  for (const contract of contracts) {
    if (seenIds.has(contract.id)) {
      throw new Error(`Duplicate contract id: ${contract.id}`);
    }

    seenIds.add(contract.id);
  }
};

const assertStrictlyIncreasingRewardPips = (
  cadence: DiceContractsCadenceMetadataData,
  label: string,
): void => {
  const simpleReward = cadence.difficulties.simple.rewardPips;
  const seriousReward = cadence.difficulties.serious.rewardPips;
  const brutalReward = cadence.difficulties.brutal.rewardPips;

  if (!(simpleReward < seriousReward && seriousReward < brutalReward)) {
    throw new Error(
      `${label}.difficulties rewardPips must increase strictly from simple to serious to brutal.`,
    );
  }
};

const readContractsPanel = (value: unknown, label: string): DiceContractsPanelData => {
  const record = assertRecord(value, label);
  const imageUrl = readNonEmptyString(record.imageUrl, `${label}.imageUrl`);

  try {
    new URL(imageUrl);
  } catch {
    throw new Error(`${label}.imageUrl must be a valid URL.`);
  }

  const parsed = {
    title: readNonEmptyString(record.title, `${label}.title`),
    imageUrl,
    description: readNonEmptyString(record.description, `${label}.description`),
    helperText: readNonEmptyString(record.helperText, `${label}.helperText`),
    dailyButtonLabel: readNonEmptyString(record.dailyButtonLabel, `${label}.dailyButtonLabel`),
    weeklyButtonLabel: readNonEmptyString(record.weeklyButtonLabel, `${label}.weeklyButtonLabel`),
    askForContractButtonLabel: readNonEmptyString(
      record.askForContractButtonLabel,
      `${label}.askForContractButtonLabel`,
    ),
  };

  assertDiscordTextLength(parsed.title, `${label}.title`, discordEmbedTitleCharacterLimit);
  assertDiscordTextLength(
    parsed.description,
    `${label}.description`,
    discordEmbedDescriptionCharacterLimit,
  );
  assertDiscordTextLength(parsed.helperText, `${label}.helperText`, discordMessageCharacterLimit);
  assertDiscordTextLength(
    parsed.dailyButtonLabel,
    `${label}.dailyButtonLabel`,
    discordButtonLabelCharacterLimit,
  );
  assertDiscordTextLength(
    parsed.weeklyButtonLabel,
    `${label}.weeklyButtonLabel`,
    discordButtonLabelCharacterLimit,
  );
  assertDiscordTextLength(
    parsed.askForContractButtonLabel,
    `${label}.askForContractButtonLabel`,
    discordButtonLabelCharacterLimit,
  );

  return parsed;
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
      hidden:
        record.hidden === undefined
          ? false
          : readBoolean(record.hidden, `achievements[${index}].hidden`),
      category: readAchievementCategory(record.category, `achievements[${index}].category`),
      rule: readAchievementRule(record.rule, `achievements[${index}].rule`),
      pipReward:
        record.pipReward === undefined
          ? undefined
          : readInteger(record.pipReward, `achievements[${index}].pipReward`, 0),
      manualAward: readManualAward(record.manualAward, `achievements[${index}].manualAward`),
      unlockReasonText: readOptionalNonEmptyString(
        record.unlockReasonText,
        `achievements[${index}].unlockReasonText`,
      ),
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

const readWorldBossRewardConfig = (value: unknown, label: string): DiceWorldBossRewardData => {
  const record = assertRecord(value, label);

  let parsedPipRewards:
    | { pipsFormula: DiceWorldBossPipRewardFormulaData }
    | { pipsByBossLevel: DiceWorldBossPipRewardTierData[] };

  if (record.pipsFormula !== undefined) {
    const pipsFormula = assertRecord(record.pipsFormula, `${label}.pipsFormula`);
    parsedPipRewards = {
      pipsFormula: {
        flatPips: readInteger(pipsFormula.flatPips, `${label}.pipsFormula.flatPips`, 0),
        flatPipsThroughBossLevel: readInteger(
          pipsFormula.flatPipsThroughBossLevel,
          `${label}.pipsFormula.flatPipsThroughBossLevel`,
          1,
        ),
      },
    };
  } else {
    if (!Array.isArray(record.pipsByBossLevel)) {
      throw new Error(`${label} must include pipsFormula or pipsByBossLevel.`);
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

    parsedPipRewards = {
      pipsByBossLevel: rewardTiers,
    };
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

  if ("pipsFormula" in parsedPipRewards) {
    return {
      pipsFormula: parsedPipRewards.pipsFormula,
      rollPassBuff: parsedRollPassBuff,
    };
  }

  return {
    pipsByBossLevel: parsedPipRewards.pipsByBossLevel,
    rollPassBuff: parsedRollPassBuff,
  };
};

const readWorldBossBossNamesConfig = (
  value: unknown,
  label: string,
): DiceWorldBossBossNamesData => {
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

const readWorldBossBossBalanceConfig = (
  value: unknown,
  label: string,
): DiceWorldBossBossBalanceData => {
  const record = assertRecord(value, label);
  return {
    baseHp: readInteger(record.baseHp, `${label}.baseHp`, 1),
    hpIncreasePerBossLevelPercent: readFiniteNumberAtLeast(
      record.hpIncreasePerBossLevelPercent,
      `${label}.hpIncreasePerBossLevelPercent`,
      0,
    ),
    levelHalfLifeLevels: readFiniteNumberAtLeast(
      record.levelHalfLifeLevels,
      `${label}.levelHalfLifeLevels`,
      1,
    ),
    maxBossLevel: readInteger(record.maxBossLevel, `${label}.maxBossLevel`, 1),
  };
};

const readWorldBossParticipantStrengthConfig = (
  value: unknown,
  label: string,
): DiceWorldBossParticipantStrengthData => {
  const record = assertRecord(value, label);

  return {
    prestigeMultiplier: readFiniteNumberAtLeast(
      record.prestigeMultiplier,
      `${label}.prestigeMultiplier`,
      1,
    ),
  };
};

export const parseDiceBalance = (value: unknown): DiceBalanceData => {
  const record = assertRecord(value, "diceBalance");
  const charge = assertRecord(record.charge, "diceBalance.charge");

  const parsed: DiceBalanceData = {
    prestigeSides: readIntegerArray(record.prestigeSides, "diceBalance.prestigeSides", 2),
    lowerPrestigeBaseDiceCount: readInteger(
      record.lowerPrestigeBaseDiceCount,
      "diceBalance.lowerPrestigeBaseDiceCount",
      1,
    ),
    banStep: readInteger(record.banStep, "diceBalance.banStep", 1),
    diceCountIncreaseReward: readInteger(
      record.diceCountIncreaseReward,
      "diceBalance.diceCountIncreaseReward",
      0,
    ),
    firstDailyRollPipReward:
      readOptionalInteger(
        record.firstDailyRollPipReward,
        "diceBalance.firstDailyRollPipReward",
        0,
      ) ?? 0,
    maxRollPassCount: readInteger(record.maxRollPassCount, "diceBalance.maxRollPassCount", 1),
    charge: {
      startAfterMinutes: readInteger(
        charge.startAfterMinutes,
        "diceBalance.charge.startAfterMinutes",
        0,
      ),
      maxMultiplier: readInteger(charge.maxMultiplier, "diceBalance.charge.maxMultiplier", 1),
    },
  };

  if (parsed.prestigeSides.length < 2) {
    throw new Error("diceBalance.prestigeSides must include at least two entries.");
  }

  return parsed;
};

export const parseDicePvpData = (value: unknown): DicePvpData => {
  const record = assertRecord(value, "pvp");
  return {
    challengeExpireMinutes: readInteger(
      record.challengeExpireMinutes,
      "pvp.challengeExpireMinutes",
      1,
    ),
    loserLockoutBaseMinutes: readInteger(
      record.loserLockoutBaseMinutes,
      "pvp.loserLockoutBaseMinutes",
      1,
    ),
    winnerBuffBaseMinutes: readInteger(
      record.winnerBuffBaseMinutes,
      "pvp.winnerBuffBaseMinutes",
      1,
    ),
  };
};

export const parseRandomEventBalance = (value: unknown): DiceRandomEventBalanceData => {
  const record = assertRecord(value, "randomEventBalance");
  return {
    claimWindowDurationMultiplier: readPositiveFiniteNumber(
      record.claimWindowDurationMultiplier,
      "randomEventBalance.claimWindowDurationMultiplier",
    ),
    variety: readVarietyConfig(record.variety, "randomEventBalance.variety"),
  };
};

export const parseWorldBossData = (value: unknown): DiceWorldBossData => {
  const record = assertRecord(value, "world-boss");
  const parsed = {
    reward: readWorldBossRewardConfig(record.reward, "worldBoss.reward"),
    bossNames: readWorldBossBossNamesConfig(record.bossNames, "worldBoss.bossNames"),
    bossBalance: readWorldBossBossBalanceConfig(record.bossBalance, "worldBoss.bossBalance"),
    participantStrength: readWorldBossParticipantStrengthConfig(
      record.participantStrength,
      "worldBoss.participantStrength",
    ),
  };

  validateWorldBossDiscordText(parsed);
  return parsed;
};

export const parseDiceContractsData = (value: unknown): DiceContractsData => {
  const record = assertRecord(value, "contracts");
  const panel = readContractsPanel(record.panel, "contracts.panel");
  const dailyMetadata = readContractsCadenceMetadata(record.daily, "contracts.daily");
  const weeklyMetadata = readContractsCadenceMetadata(record.weekly, "contracts.weekly");

  assertStrictlyIncreasingRewardPips(dailyMetadata, "contracts.daily");
  assertStrictlyIncreasingRewardPips(weeklyMetadata, "contracts.weekly");

  const ids = new Set<string>();
  for (const cadence of [dailyMetadata, weeklyMetadata]) {
    for (const difficulty of contractDifficulties) {
      const entry = cadence.difficulties[difficulty];
      assertDistinctContractIds(entry.initialOffers, ids);
      assertDistinctContractIds(entry.refillOffers, ids);
    }
  }

  const daily = buildContractsCadenceData(dailyMetadata);
  const weekly = buildContractsCadenceData(weeklyMetadata);

  return {
    panel,
    daily,
    weekly,
  };
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
  validateRandomEventScenarios(parsed);
  parsed.forEach((scenario, index) =>
    validateRandomEventScenarioDiscordText(scenario, `randomEventsV1[${index}]`),
  );
  return parsed;
};

export const validateRandomEventConsumableRewards = (
  scenarios: RandomEventScenario[],
  items: DiceItemData[],
): void => {
  const itemsById = new Map(items.map((item) => [item.id, item]));

  for (const scenario of scenarios) {
    const effectSets = scenario.outcomes.map((outcome) => ({
      locationLabel: `outcome ${outcome.id}`,
      effects: outcome.effects,
    }));
    if (
      scenario.flow?.type === "solo-ladder" ||
      scenario.flow?.type === "solo-push-your-luck" ||
      scenario.flow?.type === "group-meter"
    ) {
      for (const stage of scenario.flow.stages) {
        effectSets.push({
          locationLabel: `stage ${stage.id} successEffects`,
          effects: stage.successEffects,
        });
        if (stage.failureEffects) {
          effectSets.push({
            locationLabel: `stage ${stage.id} failureEffects`,
            effects: stage.failureEffects,
          });
        }
      }
    }

    for (const effectSet of effectSets) {
      for (const effect of effectSet.effects) {
        if (effect.type !== "consumable-item") {
          continue;
        }

        const item = itemsById.get(effect.itemId);
        if (!item) {
          throw new Error(
            `Scenario ${scenario.id} ${effectSet.locationLabel} references unknown consumable item '${effect.itemId}'.`,
          );
        }

        if (!item.consumable) {
          throw new Error(
            `Scenario ${scenario.id} ${effectSet.locationLabel} must reference a consumable item, but '${effect.itemId}' is passive.`,
          );
        }
      }
    }
  }
};

export const parseIntroPostsV1Data = (value: unknown): IntroPostsV1Data => {
  const record = assertRecord(value, "introPostsV1");

  if (!Array.isArray(record.messages)) {
    throw new Error("introPostsV1.messages must be an array.");
  }

  const messages = record.messages.map((entry, index) => {
    const message = assertRecord(entry, `introPostsV1.messages[${index}]`);
    const content = readNonEmptyString(message.content, `introPostsV1.messages[${index}].content`);
    if (content.length > introPostContentMaxLength) {
      throw new Error(
        `introPostsV1.messages[${index}].content must be <= ${introPostContentMaxLength} characters.`,
      );
    }

    return {
      content,
    };
  });

  if (messages.length < 1) {
    throw new Error("introPostsV1.messages must include at least one entry.");
  }

  return { messages };
};

export const parseDiceItems = (value: unknown): DiceItemData[] => {
  if (!Array.isArray(value)) {
    throw new Error("Dice items data must be an array.");
  }

  const parsed = value.map((entry, index) => {
    const record = assertRecord(entry, `itemsV1[${index}]`);
    const item = {
      id: readNonEmptyString(record.id, `itemsV1[${index}].id`),
      name: readNonEmptyString(record.name, `itemsV1[${index}].name`),
      description: readNonEmptyString(record.description, `itemsV1[${index}].description`),
      pricePips: readInteger(record.pricePips, `itemsV1[${index}].pricePips`, 0),
      consumable: readBoolean(record.consumable, `itemsV1[${index}].consumable`),
      repeatablePricing:
        record.repeatablePricing === undefined
          ? undefined
          : readDiceItemRepeatablePricing(
              record.repeatablePricing,
              `itemsV1[${index}].repeatablePricing`,
            ),
      requiresItemId:
        record.requiresItemId === undefined
          ? undefined
          : readNonEmptyString(record.requiresItemId, `itemsV1[${index}].requiresItemId`),
      effect: readDiceItemEffect(record.effect, `itemsV1[${index}].effect`),
    };

    validateDiceItemDiscordText(item, `itemsV1[${index}]`);
    return item;
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

    if (item.consumable && isPassiveDiceItemEffect(item.effect)) {
      throw new Error(`Passive item ${item.id} must set consumable to false.`);
    }

    if (item.repeatablePricing && !isPassiveDiceItemEffect(item.effect)) {
      throw new Error(
        `Only passive upgrades may declare repeatablePricing, but ${item.id} is not passive.`,
      );
    }

    if (item.repeatablePricing && !isRepeatablePassiveDiceItemEffect(item.effect)) {
      throw new Error(
        `Only stacking passive upgrades may declare repeatablePricing, but ${item.id} does not stack.`,
      );
    }

    if (item.requiresItemId === item.id) {
      throw new Error(`Item ${item.id} cannot require itself.`);
    }

    ids.add(item.id);
  }

  for (const item of parsed) {
    if (item.requiresItemId && !ids.has(item.requiresItemId)) {
      throw new Error(`Item ${item.id} requires unknown item '${item.requiresItemId}'.`);
    }
  }

  return parsed;
};
