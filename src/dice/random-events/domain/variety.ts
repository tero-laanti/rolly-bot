export type RandomEventRarityTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type RandomEventVarietyTemplate = {
  id: string;
  rarity: RandomEventRarityTier;
  weight?: number;
};

export type RandomEventVarietyPityConfig = {
  enabled: boolean;
  startAfterNonRareTriggers: number;
  rareWeightStep: number;
  epicWeightStep: number;
  legendaryWeightStep: number;
  maxBonusMultiplier: number;
};

export type RandomEventVarietyOptions = {
  antiRepeatCooldownTriggers?: number;
  rarityChances?: Partial<Record<RandomEventRarityTier, number>>;
  pity?: Partial<RandomEventVarietyPityConfig>;
  random?: () => number;
};

export type RandomEventVarietyState = {
  triggerCount: number;
  nonRareStreak: number;
  lastSeenTriggerByTemplateId: Map<string, number>;
};

export type RandomEventVarietyStateSnapshot = {
  triggerCount: number;
  nonRareStreak: number;
  lastSeenTriggerByTemplateId: Record<string, number>;
};

const rarityOrder: RandomEventRarityTier[] = ["common", "uncommon", "rare", "epic", "legendary"];

const rareTiers = new Set<RandomEventRarityTier>(["rare", "epic", "legendary"]);

const defaultRarityChances: Record<RandomEventRarityTier, number> = {
  common: 0.45,
  uncommon: 0.28,
  rare: 0.17,
  epic: 0.08,
  legendary: 0.02,
};

const defaultPityConfig: RandomEventVarietyPityConfig = {
  enabled: true,
  startAfterNonRareTriggers: 5,
  rareWeightStep: 0.1,
  epicWeightStep: 0.15,
  legendaryWeightStep: 0.2,
  maxBonusMultiplier: 2,
};

const getRandom = (random: (() => number) | undefined): number => {
  const value = (random ?? Math.random)();
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 0.999999;
  }

  return value;
};

const normalizeNonNegativeNumber = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return Math.max(0, fallback);
  }

  return Math.max(0, value ?? fallback);
};

const normalizeIntegerWithFallback = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return Math.max(0, Math.floor(fallback));
  }

  return Math.max(0, Math.floor(value ?? fallback));
};

const normalizeNumberWithMin = (
  value: number | undefined,
  fallback: number,
  minValue: number,
): number => {
  if (!Number.isFinite(value)) {
    return Math.max(minValue, fallback);
  }

  return Math.max(minValue, value ?? fallback);
};

const resolvePityConfig = (
  config: Partial<RandomEventVarietyPityConfig> | undefined,
): RandomEventVarietyPityConfig => {
  return {
    enabled: config?.enabled ?? defaultPityConfig.enabled,
    startAfterNonRareTriggers: normalizeIntegerWithFallback(
      config?.startAfterNonRareTriggers,
      defaultPityConfig.startAfterNonRareTriggers,
    ),
    rareWeightStep: normalizeNonNegativeNumber(
      config?.rareWeightStep,
      defaultPityConfig.rareWeightStep,
    ),
    epicWeightStep: normalizeNonNegativeNumber(
      config?.epicWeightStep,
      defaultPityConfig.epicWeightStep,
    ),
    legendaryWeightStep: normalizeNonNegativeNumber(
      config?.legendaryWeightStep,
      defaultPityConfig.legendaryWeightStep,
    ),
    maxBonusMultiplier: normalizeNumberWithMin(
      config?.maxBonusMultiplier,
      defaultPityConfig.maxBonusMultiplier,
      1,
    ),
  };
};

const getPityBonusMultiplier = (
  rarity: RandomEventRarityTier,
  nonRareStreak: number,
  config: RandomEventVarietyPityConfig,
): number => {
  if (!config.enabled || !rareTiers.has(rarity)) {
    return 1;
  }

  if (nonRareStreak < config.startAfterNonRareTriggers) {
    return 1;
  }

  const stepCount = nonRareStreak - config.startAfterNonRareTriggers + 1;
  const step =
    rarity === "legendary"
      ? config.legendaryWeightStep
      : rarity === "epic"
        ? config.epicWeightStep
        : config.rareWeightStep;

  const rawBonus = 1 + stepCount * step;
  return Math.min(config.maxBonusMultiplier, Math.max(1, rawBonus));
};

const isTemplateEligibleByCooldown = (
  templateId: string,
  triggerCount: number,
  cooldownTriggers: number,
  lastSeenTriggerByTemplateId: Map<string, number>,
): boolean => {
  if (cooldownTriggers < 1) {
    return true;
  }

  const lastSeenTrigger = lastSeenTriggerByTemplateId.get(templateId);
  if (lastSeenTrigger === undefined) {
    return true;
  }

  return triggerCount - lastSeenTrigger >= cooldownTriggers;
};

const getTemplateSelectionWeight = (template: RandomEventVarietyTemplate): number => {
  if (!Number.isFinite(template.weight)) {
    return 1;
  }

  return Math.max(0, template.weight ?? 1);
};

const pickWeightedTemplate = (
  templates: RandomEventVarietyTemplate[],
  getWeight: (template: RandomEventVarietyTemplate) => number,
  random: (() => number) | undefined,
): RandomEventVarietyTemplate | null => {
  if (templates.length < 1) {
    return null;
  }

  const weightedTemplates = templates.map((template) => ({
    template,
    weight: Math.max(0, getWeight(template)),
  }));

  const positiveWeightTemplates = weightedTemplates.filter((item) => item.weight > 0);
  if (positiveWeightTemplates.length < 1) {
    const index = Math.floor(getRandom(random) * weightedTemplates.length);
    return weightedTemplates[index]?.template ?? weightedTemplates[0]?.template ?? null;
  }

  const totalWeight = positiveWeightTemplates.reduce((sum, item) => sum + item.weight, 0);
  let cursor = getRandom(random) * totalWeight;

  for (const item of positiveWeightTemplates) {
    cursor -= item.weight;
    if (cursor < 0) {
      return item.template;
    }
  }

  return positiveWeightTemplates[positiveWeightTemplates.length - 1]?.template ?? null;
};

const groupTemplatesByRarity = (
  templates: RandomEventVarietyTemplate[],
): Record<RandomEventRarityTier, RandomEventVarietyTemplate[]> => {
  const grouped: Record<RandomEventRarityTier, RandomEventVarietyTemplate[]> = {
    common: [],
    uncommon: [],
    rare: [],
    epic: [],
    legendary: [],
  };

  for (const template of templates) {
    grouped[template.rarity].push(template);
  }

  return grouped;
};

const getCooldownEligibleTemplatesForBucket = (
  templates: RandomEventVarietyTemplate[],
  state: RandomEventVarietyState,
  cooldownTriggers: number,
): RandomEventVarietyTemplate[] => {
  return templates.filter((template) =>
    isTemplateEligibleByCooldown(
      template.id,
      state.triggerCount,
      cooldownTriggers,
      state.lastSeenTriggerByTemplateId,
    ),
  );
};

const getBucketSelectionWeight = (
  rarity: RandomEventRarityTier,
  state: RandomEventVarietyState,
  options: RandomEventVarietyOptions,
  pityConfig: RandomEventVarietyPityConfig,
): number => {
  const baseChance = normalizeNonNegativeNumber(
    options.rarityChances?.[rarity],
    defaultRarityChances[rarity],
  );
  const pityBonusMultiplier = getPityBonusMultiplier(rarity, state.nonRareStreak, pityConfig);

  return baseChance * pityBonusMultiplier;
};

export const createRandomEventVarietyState = (): RandomEventVarietyState => {
  return {
    triggerCount: 0,
    nonRareStreak: 0,
    lastSeenTriggerByTemplateId: new Map(),
  };
};

export const getRandomEventVarietyStateSnapshot = (
  state: RandomEventVarietyState,
): RandomEventVarietyStateSnapshot => {
  return {
    triggerCount: state.triggerCount,
    nonRareStreak: state.nonRareStreak,
    lastSeenTriggerByTemplateId: Object.fromEntries(state.lastSeenTriggerByTemplateId.entries()),
  };
};

export const restoreRandomEventVarietyState = (
  snapshot: RandomEventVarietyStateSnapshot,
): RandomEventVarietyState => {
  return {
    triggerCount: Math.max(0, Math.floor(snapshot.triggerCount)),
    nonRareStreak: Math.max(0, Math.floor(snapshot.nonRareStreak)),
    lastSeenTriggerByTemplateId: new Map(Object.entries(snapshot.lastSeenTriggerByTemplateId)),
  };
};

export const selectRandomEventTemplateWithVariety = (
  templates: RandomEventVarietyTemplate[],
  state: RandomEventVarietyState,
  options: RandomEventVarietyOptions = {},
): RandomEventVarietyTemplate | null => {
  if (templates.length < 1) {
    return null;
  }

  const cooldownTriggers = Math.max(0, Math.floor(options.antiRepeatCooldownTriggers ?? 0));
  const pityConfig = resolvePityConfig(options.pity);
  const templatesByRarity = groupTemplatesByRarity(templates);

  const bucketCandidates: Array<{
    rarity: RandomEventRarityTier;
    templates: RandomEventVarietyTemplate[];
    hasCooldownEligibleTemplates: boolean;
  }> = [];

  for (const rarity of rarityOrder) {
    const bucketTemplates = templatesByRarity[rarity];
    if (bucketTemplates.length < 1) {
      continue;
    }

    const cooldownEligibleTemplates = getCooldownEligibleTemplatesForBucket(
      bucketTemplates,
      state,
      cooldownTriggers,
    );

    bucketCandidates.push({
      rarity,
      templates: cooldownEligibleTemplates.length > 0 ? cooldownEligibleTemplates : bucketTemplates,
      hasCooldownEligibleTemplates: cooldownEligibleTemplates.length > 0,
    });
  }

  if (bucketCandidates.length < 1) {
    return null;
  }

  const hasAnyCooldownEligibleBucket = bucketCandidates.some(
    (bucket) => bucket.hasCooldownEligibleTemplates,
  );
  const eligibleBucketCandidates = hasAnyCooldownEligibleBucket
    ? bucketCandidates.filter((bucket) => bucket.hasCooldownEligibleTemplates)
    : bucketCandidates;

  const selectedBucket = pickWeightedTemplate(
    eligibleBucketCandidates.map((bucket) => ({
      id: bucket.rarity,
      rarity: bucket.rarity,
      weight: getBucketSelectionWeight(bucket.rarity, state, options, pityConfig),
    })),
    (bucketTemplate) => Math.max(0, bucketTemplate.weight ?? 0),
    options.random,
  );

  if (!selectedBucket) {
    return null;
  }

  const selectedBucketTemplates =
    eligibleBucketCandidates.find((bucket) => bucket.rarity === selectedBucket.rarity)?.templates ??
    [];

  const selectedTemplate = pickWeightedTemplate(
    selectedBucketTemplates,
    getTemplateSelectionWeight,
    options.random,
  );

  if (!selectedTemplate) {
    return null;
  }

  state.triggerCount += 1;
  state.lastSeenTriggerByTemplateId.set(selectedTemplate.id, state.triggerCount);

  if (rareTiers.has(selectedTemplate.rarity)) {
    state.nonRareStreak = 0;
  } else {
    state.nonRareStreak += 1;
  }

  return selectedTemplate;
};
