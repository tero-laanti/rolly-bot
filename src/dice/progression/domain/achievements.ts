import { getDiceAchievementsData } from "../../../rolly-data/load";
import type { DiceAchievementCategory, DiceAchievementRule } from "../../../rolly-data/types";

type DiceAchievementDefinition = {
  id: DiceAchievementId;
  name: string;
  description: string;
  category: DiceAchievementCategory;
  unlockReasonText?: string;
  rule: DiceAchievementRule;
  evaluate: (context: RollContext) => boolean;
};

export type DiceAchievementId = string;

export type RollContext = {
  rolls: number[];
  counts: Map<number, number>;
  unique: Set<number>;
  rolledAtMs: number;
};

const timeFormatterByTimezone = new Map<string, Intl.DateTimeFormat>();

const getTimeFormatter = (timezone: string): Intl.DateTimeFormat => {
  const cached = timeFormatterByTimezone.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    hour12: false,
  });
  timeFormatterByTimezone.set(timezone, formatter);
  return formatter;
};

const evaluateAchievementRule = (rule: DiceAchievementRule, context: RollContext): boolean => {
  switch (rule.type) {
    case "ordered-sequence":
      return hasOrderedSequence(context.rolls, rule.pattern);
    case "contains-all-values":
      return hasStraight(context.unique, rule.values);
    case "at-least-of-a-kind":
      return hasAtLeastOfAKind(context.counts, rule.count);
    case "count-at-least-of-a-kind":
      return countAtLeastOfAKind(context.counts, rule.count) >= rule.groups;
    case "count-exact-of-a-kind":
      return countExactOfAKind(context.counts, rule.count) >= rule.groups;
    case "ordered-two-pairs":
      return hasOrderedTwoPairs(context.rolls);
    case "ordered-full-house":
      return hasOrderedFullHouse(context.rolls);
    case "contains-value":
      return context.counts.has(rule.value);
    case "exact-time": {
      const { hour, minute } = getHourMinuteForTimezone(context.rolledAtMs, rule.timezone);
      return hour === rule.hour && minute === rule.minute;
    }
    case "all-of":
      return rule.rules.every((nestedRule) => evaluateAchievementRule(nestedRule, context));
    case "manual":
      return false;
  }
};

export const diceAchievements: DiceAchievementDefinition[] = getDiceAchievementsData().map(
  (achievement) => ({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    category: achievement.category,
    unlockReasonText: achievement.unlockReasonText,
    rule: achievement.rule,
    evaluate: (context) => evaluateAchievementRule(achievement.rule, context),
  }),
);

const diceAchievementById = new Map(
  diceAchievements.map((achievement) => [achievement.id, achievement]),
);

const prestigeAchievementIdByPrestige = new Map<number, DiceAchievementId>(
  getDiceAchievementsData()
    .filter((achievement) => achievement.manualAward?.type === "prestige")
    .map((achievement) => [achievement.manualAward?.prestige ?? -1, achievement.id]),
);

export const getDiceAchievement = (
  id: DiceAchievementId,
): DiceAchievementDefinition | undefined => {
  return diceAchievementById.get(id);
};

export const isManualDiceAchievement = (id: DiceAchievementId): boolean => {
  return getDiceAchievement(id)?.rule.type === "manual";
};

export const getPrestigeAchievementId = (prestige: number): DiceAchievementId | undefined => {
  return prestigeAchievementIdByPrestige.get(Math.max(0, Math.floor(prestige)));
};

export const createRollContext = (
  rolls: number[],
  rolledAtMs: number = Date.now(),
): RollContext => {
  const counts = new Map<number, number>();
  const unique = new Set<number>();
  for (const roll of rolls) {
    counts.set(roll, (counts.get(roll) ?? 0) + 1);
    unique.add(roll);
  }

  return { rolls, counts, unique, rolledAtMs };
};

const getHourMinuteForTimezone = (
  rolledAtMs: number,
  timezone: string,
): { hour: number; minute: number } => {
  const parts = getTimeFormatter(timezone).formatToParts(new Date(rolledAtMs));
  const hourPart = parts.find((part) => part.type === "hour")?.value;
  const minutePart = parts.find((part) => part.type === "minute")?.value;
  const hour = Number.parseInt(hourPart ?? "", 10);
  const minute = Number.parseInt(minutePart ?? "", 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return { hour: -1, minute: -1 };
  }

  return { hour, minute };
};

const hasOrderedSequence = (rolls: number[], pattern: number[]): boolean => {
  if (pattern.length === 0) {
    return true;
  }
  if (pattern.length > rolls.length) {
    return false;
  }

  for (let start = 0; start <= rolls.length - pattern.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (rolls[start + offset] !== pattern[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }

  return false;
};

const hasOrderedTwoPairs = (rolls: number[]): boolean => {
  if (rolls.length < 4) {
    return false;
  }

  for (let start = 0; start <= rolls.length - 4; start += 1) {
    const first = rolls[start];
    const second = rolls[start + 2];
    if (rolls[start + 1] === first && rolls[start + 3] === second && first !== second) {
      return true;
    }
  }

  return false;
};

const hasOrderedFullHouse = (rolls: number[]): boolean => {
  if (rolls.length < 5) {
    return false;
  }

  for (let start = 0; start <= rolls.length - 5; start += 1) {
    const tripleValue = rolls[start];
    const pairValue = rolls[start + 3];
    if (
      rolls[start + 1] === tripleValue &&
      rolls[start + 2] === tripleValue &&
      rolls[start + 4] === pairValue &&
      tripleValue !== pairValue
    ) {
      return true;
    }
  }

  return false;
};

const hasStraight = (values: Set<number>, straight: number[]): boolean => {
  return straight.every((value) => values.has(value));
};

const hasAtLeastOfAKind = (counts: Map<number, number>, target: number): boolean => {
  for (const count of counts.values()) {
    if (count >= target) {
      return true;
    }
  }
  return false;
};

const countAtLeastOfAKind = (counts: Map<number, number>, target: number): number => {
  let total = 0;
  for (const count of counts.values()) {
    if (count >= target) {
      total += 1;
    }
  }
  return total;
};

const countExactOfAKind = (counts: Map<number, number>, target: number): number => {
  let total = 0;
  for (const count of counts.values()) {
    if (count === target) {
      total += 1;
    }
  }
  return total;
};
