import { getDiceAchievement, type DiceAchievementId } from "../../../progression/domain/achievements";

const compactRollSetThreshold = 35;
const discordMessageCharacterLimit = 2_000;
const nonBreakingSpace = "\u00A0";
const compactRollSetSeparator = " | ";

type RollSetOutputMode = "detailed" | "compact";

type HighlightedRollSet = {
  setIndex: number;
  formattedRolls: string;
  unlockedAchievementIds: DiceAchievementId[];
  hasMatchingDice: boolean;
};

type BuildDiceRollReplyContentInput = {
  achievementText: string;
  unlockedFooter: string;
  doubleRollFooter: string;
  prestigeFooter: string;
  chargeMultiplier: number;
  didChargePathWin: boolean;
  rollPasses: number[][];
  rollPassAchievementIds: DiceAchievementId[][];
  previouslyEarnedAchievementIds: Set<DiceAchievementId>;
  matchCount: number;
  rewardText: string;
};

export const formatAchievementText = (achievementIds: DiceAchievementId[]): string => {
  if (achievementIds.length === 0) {
    return "";
  }

  const names = achievementIds.map((id) => getDiceAchievement(id)?.name ?? id);
  const label = names.length === 1 ? "Achievement" : "Achievements";
  return `${label} unlocked: ${names.join(", ")}.`;
};

export const formatRewardText = (totalReward: number, hasLevelUp: boolean): string => {
  const rewardParts: string[] = [];
  if (totalReward > 0) {
    rewardParts.push(`${totalReward} Fame`);
  }
  if (hasLevelUp) {
    rewardParts.push("a new die");
  }

  return rewardParts.length > 0 ? `You receive ${rewardParts.join(" and ")}.` : "";
};

export const buildDiceRollReplyContent = ({
  achievementText,
  unlockedFooter,
  doubleRollFooter,
  prestigeFooter,
  chargeMultiplier,
  didChargePathWin,
  rollPasses,
  rollPassAchievementIds,
  previouslyEarnedAchievementIds,
  matchCount,
  rewardText,
}: BuildDiceRollReplyContentInput): string => {
  const rollPassCount = rollPasses.length;
  const isChargedRoll = didChargePathWin;
  const formattedRollPasses = rollPasses.map(formatRolls);
  const allSameByRollSet = rollPasses.map((rolls) => rolls.every((roll) => roll === rolls[0]));
  const knownAchievementIds = new Set(previouslyEarnedAchievementIds);
  const newlyUnlockedAchievementIdsByRollSet = getNewlyUnlockedAchievementIdsByRollSet(
    rollPassAchievementIds,
    knownAchievementIds,
  );
  const highlightedRollSets = getHighlightedRollSets({
    formattedRollPasses,
    allSameByRollSet,
    newlyUnlockedAchievementIdsByRollSet,
  });

  const fixedContentParts = [achievementText, unlockedFooter, doubleRollFooter, prestigeFooter];
  const initialRollSetOutputMode: RollSetOutputMode =
    rollPassCount > compactRollSetThreshold ? "compact" : "detailed";

  let resultLines = buildResultLines({
    chargeMultiplier,
    isChargedRoll,
    rollPassCount,
    matchCount,
    rollPasses,
    formattedRollPasses,
    highlightedRollSets,
    rewardText,
    rollSetOutputMode: initialRollSetOutputMode,
  });

  let content = buildDiceReplyContent({
    achievementText,
    resultLines,
    unlockedFooter,
    doubleRollFooter,
    prestigeFooter,
  });

  if (content.length > discordMessageCharacterLimit && initialRollSetOutputMode !== "compact") {
    resultLines = buildResultLines({
      chargeMultiplier,
      isChargedRoll,
      rollPassCount,
      matchCount,
      rollPasses,
      formattedRollPasses,
      highlightedRollSets,
      rewardText,
      rollSetOutputMode: "compact",
    });
    content = buildDiceReplyContent({
      achievementText,
      resultLines,
      unlockedFooter,
      doubleRollFooter,
      prestigeFooter,
    });
  }

  if (content.length > discordMessageCharacterLimit) {
    const maxResultLength = getMaxResultLengthForReply({
      achievementText,
      trailingParts: fixedContentParts.slice(1),
      messageLimit: discordMessageCharacterLimit,
    });
    resultLines = buildResultLines({
      chargeMultiplier,
      isChargedRoll,
      rollPassCount,
      matchCount,
      rollPasses,
      formattedRollPasses,
      highlightedRollSets,
      rewardText,
      rollSetOutputMode: "compact",
      maxResultLength,
    });
    content = buildDiceReplyContent({
      achievementText,
      resultLines,
      unlockedFooter,
      doubleRollFooter,
      prestigeFooter,
    });
  }

  return truncateToLimit(content, discordMessageCharacterLimit);
};

const formatRolls = (rolls: number[]): string => {
  return `**${rolls.join(`,${nonBreakingSpace}`)}**`;
};

type BuildResultLinesInput = {
  chargeMultiplier: number;
  isChargedRoll: boolean;
  rollPassCount: number;
  matchCount: number;
  rollPasses: number[][];
  formattedRollPasses: string[];
  highlightedRollSets: HighlightedRollSet[];
  rewardText: string;
  rollSetOutputMode: RollSetOutputMode;
  maxResultLength?: number;
};

const buildResultLines = ({
  chargeMultiplier,
  isChargedRoll,
  rollPassCount,
  matchCount,
  rollPasses,
  formattedRollPasses,
  highlightedRollSets,
  rewardText,
  rollSetOutputMode,
  maxResultLength,
}: BuildResultLinesInput): string[] => {
  const resultLines: string[] = [];
  if (isChargedRoll) {
    resultLines.push(`${chargeMultiplier}x Dice charge!`);
  }

  if (rollPassCount === 1) {
    const singleRoll =
      rollSetOutputMode === "compact"
        ? formatCompactRollSet(rollPasses[0] ?? [])
        : (formattedRollPasses[0] ?? "");
    const matchSuffix = matchCount > 0 ? " All dice matched." : "";
    resultLines.push(`You rolled ${singleRoll}.${matchSuffix}`);
  } else {
    resultLines.push("Roll results:");
    const rollSetLines =
      rollSetOutputMode === "compact"
        ? formatCompactRollSetLines({
            rollPasses,
            highlightedRollSets,
          })
        : isChargedRoll
          ? formatChargedRollSetLines(formattedRollPasses)
          : formatStandardRollSetLines(formattedRollPasses);
    resultLines.push(...rollSetLines);

    const matchLine = getMatchLine(matchCount, rollPassCount);
    if (matchLine) {
      resultLines.push(matchLine);
    }
  }

  if (rewardText) {
    resultLines.push(rewardText);
  }

  if (
    rollSetOutputMode === "compact" &&
    rollPassCount > 1 &&
    typeof maxResultLength === "number" &&
    resultLines.join("\n").length > maxResultLength
  ) {
    return buildCompactResultLinesWithinLimit({
      chargeMultiplier,
      isChargedRoll,
      rollPassCount,
      matchCount,
      rollPasses,
      highlightedRollSets,
      rewardText,
      maxResultLength,
    });
  }

  return resultLines;
};

const formatStandardRollSetLines = (formattedRollPasses: string[]): string[] => {
  return formattedRollPasses.map((rolls, index) => `Set ${index + 1}: ${rolls}.`);
};

const formatChargedRollSetLines = (formattedRollPasses: string[]): string[] => {
  if (formattedRollPasses.length < 1) {
    return [];
  }

  const line = formattedRollPasses
    .map((rolls, index) => `${index + 1}:${nonBreakingSpace}${rolls}`)
    .join(compactRollSetSeparator);
  return [line];
};

const formatCompactRollSet = (rolls: number[]): string => {
  return `**${rolls.join(`,${nonBreakingSpace}`)}**`;
};

const formatCompactRollSets = (rollPasses: number[][]): string => {
  return rollPasses.map((rolls) => formatCompactRollSet(rolls)).join(compactRollSetSeparator);
};

const formatCompactRollSetLine = (rollPasses: number[][]): string => {
  return `${formatCompactRollSets(rollPasses)}.`;
};

type FormatCompactRollSetLinesInput = {
  rollPasses: number[][];
  highlightedRollSets: HighlightedRollSet[];
};

const formatCompactRollSetLines = ({
  rollPasses,
  highlightedRollSets,
}: FormatCompactRollSetLinesInput): string[] => {
  const sortedHighlightedRollSets = sortHighlightedRollSets(highlightedRollSets);
  const lines = sortedHighlightedRollSets.map((rollSet) => formatHighlightedRollSetLine(rollSet));
  const shownHighlightIndexes = new Set(
    sortedHighlightedRollSets.map((rollSet) => rollSet.setIndex),
  );
  const remainingRollPasses = rollPasses.filter((_, index) => !shownHighlightIndexes.has(index));

  if (remainingRollPasses.length > 0) {
    const compactLine = formatCompactRollSetLine(remainingRollPasses);
    lines.push(lines.length > 0 ? `Other sets: ${compactLine}` : compactLine);
  }

  if (lines.length > 0) {
    return lines;
  }

  if (rollPasses.length === 0) {
    return [];
  }

  return [formatCompactRollSetLine(rollPasses)];
};

const formatHighlightedRollSetLine = ({
  setIndex,
  formattedRolls,
  unlockedAchievementIds,
  hasMatchingDice,
}: HighlightedRollSet): string => {
  const tags: string[] = [];
  if (unlockedAchievementIds.length > 0) {
    tags.push("new achievement");
  }
  if (hasMatchingDice) {
    tags.push("all dice matched");
  }

  const tagSuffix = tags.length > 0 ? ` (${tags.join(", ")})` : "";
  return `Set ${setIndex + 1}: ${formattedRolls}.${tagSuffix}`;
};

const sortHighlightedRollSets = (
  highlightedRollSets: HighlightedRollSet[],
): HighlightedRollSet[] => {
  return [...highlightedRollSets].sort((a, b) => a.setIndex - b.setIndex);
};

type BuildCompactResultLinesWithinLimitInput = {
  chargeMultiplier: number;
  isChargedRoll: boolean;
  rollPassCount: number;
  matchCount: number;
  rollPasses: number[][];
  highlightedRollSets: HighlightedRollSet[];
  rewardText: string;
  maxResultLength: number;
};

const buildCompactResultLinesWithinLimit = ({
  chargeMultiplier,
  isChargedRoll,
  rollPassCount,
  matchCount,
  rollPasses,
  highlightedRollSets,
  rewardText,
  maxResultLength,
}: BuildCompactResultLinesWithinLimitInput): string[] => {
  const leadingLines: string[] = [];
  if (isChargedRoll) {
    leadingLines.push(`${chargeMultiplier}x Dice charge!`);
  }
  leadingLines.push("Roll results:");

  const trailingLines: string[] = [];
  const matchLine = getMatchLine(matchCount, rollPassCount);
  if (matchLine) {
    trailingLines.push(matchLine);
  }
  if (rewardText) {
    trailingLines.push(rewardText);
  }

  const leadingLength = leadingLines.join("\n").length;
  const trailingLength = trailingLines.join("\n").length;
  const separatorLength = (leadingLines.length > 0 ? 1 : 0) + (trailingLines.length > 0 ? 1 : 0);
  const maxRollSectionLength = Math.max(
    0,
    maxResultLength - leadingLength - trailingLength - separatorLength,
  );
  const rollLines = formatCompactRollSetLinesWithinLimit({
    rollPasses,
    highlightedRollSets,
    maxLength: maxRollSectionLength,
  });

  const resultLines = [...leadingLines];
  resultLines.push(...rollLines);
  resultLines.push(...trailingLines);
  return resultLines;
};

type FormatCompactRollSetLinesWithinLimitInput = {
  rollPasses: number[][];
  highlightedRollSets: HighlightedRollSet[];
  maxLength: number;
};

const formatCompactRollSetLinesWithinLimit = ({
  rollPasses,
  highlightedRollSets,
  maxLength,
}: FormatCompactRollSetLinesWithinLimitInput): string[] => {
  if (maxLength < 1) {
    return [];
  }

  const lines: string[] = [];
  let usedLength = 0;

  const pushLineWithinLimit = (line: string): boolean => {
    const additionalLength = (lines.length > 0 ? 1 : 0) + line.length;
    if (usedLength + additionalLength > maxLength) {
      return false;
    }

    lines.push(line);
    usedLength += additionalLength;
    return true;
  };

  const sortedHighlightedRollSets = sortHighlightedRollSets(highlightedRollSets);
  const shownHighlightIndexes = new Set<number>();
  let omittedNotableCount = 0;
  for (let index = 0; index < sortedHighlightedRollSets.length; index += 1) {
    const rollSet = sortedHighlightedRollSets[index];
    const line = formatHighlightedRollSetLine(rollSet);
    if (!pushLineWithinLimit(line)) {
      omittedNotableCount = sortedHighlightedRollSets.length - index;
      break;
    }

    shownHighlightIndexes.add(rollSet.setIndex);
  }

  if (omittedNotableCount > 0) {
    const summaryLine = `... (+${omittedNotableCount} more notable sets)`;
    if (!pushLineWithinLimit(summaryLine) && lines.length < 1) {
      return [fitToLength(summaryLine, maxLength)];
    }
  }

  const remainingRollPasses = rollPasses.filter((_, index) => !shownHighlightIndexes.has(index));
  if (remainingRollPasses.length < 1) {
    return lines.length > 0 ? lines : [fitToLength("...", maxLength)];
  }

  const maxCompactLineLength = maxLength - usedLength - (lines.length > 0 ? 1 : 0);
  if (maxCompactLineLength < 1) {
    return lines.length > 0 ? lines : [fitToLength("...", maxLength)];
  }

  const linePrefix = lines.length > 0 ? "Other sets: " : "";
  const maxCompactBodyLength = Math.max(0, maxCompactLineLength - linePrefix.length - 1);
  const compactBody = formatCompactRollSetsWithinLimit(remainingRollPasses, maxCompactBodyLength);
  const rawCompactLine = `${linePrefix}${compactBody.length > 0 ? compactBody : "..."}.`;
  const compactLine = fitToLength(rawCompactLine, maxCompactLineLength);
  if (compactLine.length > 0) {
    lines.push(compactLine);
    return lines;
  }

  return lines.length > 0 ? lines : [fitToLength("...", maxLength)];
};

const formatCompactRollSetsWithinLimit = (rollPasses: number[][], maxLength: number): string => {
  if (maxLength < 1 || rollPasses.length < 1) {
    return "";
  }

  const formattedRollSets = rollPasses.map((rolls) => formatCompactRollSet(rolls));
  let output = "";

  for (let index = 0; index < formattedRollSets.length; index += 1) {
    const separator = index === 0 ? "" : compactRollSetSeparator;
    const nextOutput = `${output}${separator}${formattedRollSets[index]}`;
    const remainingSetCount = formattedRollSets.length - index - 1;
    const previewSuffix =
      remainingSetCount > 0
        ? `${compactRollSetSeparator}... (+${remainingSetCount} more sets)`
        : "";
    if (nextOutput.length + previewSuffix.length > maxLength) {
      if (output.length < 1) {
        return fitToLength(`... (+${formattedRollSets.length} more sets)`, maxLength);
      }

      const overflowSetCount = formattedRollSets.length - index;
      return appendSuffixWithinLimit(
        output,
        `${compactRollSetSeparator}... (+${overflowSetCount} more sets)`,
        maxLength,
        compactRollSetSeparator,
      );
    }

    output = nextOutput;
  }

  return output;
};

const appendSuffixWithinLimit = (
  base: string,
  suffix: string,
  maxLength: number,
  separator: string,
): string => {
  if (base.length + suffix.length <= maxLength) {
    return `${base}${suffix}`;
  }

  let trimmedBase = base;
  while (trimmedBase.length > 0) {
    const separatorIndex = trimmedBase.lastIndexOf(separator);
    trimmedBase = separatorIndex === -1 ? "" : trimmedBase.slice(0, separatorIndex);
    if (trimmedBase.length + suffix.length <= maxLength) {
      return `${trimmedBase}${suffix}`;
    }
  }

  const suffixWithoutLeadingSeparator = suffix.startsWith(separator)
    ? suffix.slice(separator.length)
    : suffix;
  return fitToLength(suffixWithoutLeadingSeparator, maxLength);
};

type BuildReplyContentInput = {
  achievementText: string;
  resultLines: string[];
  unlockedFooter: string;
  doubleRollFooter: string;
  prestigeFooter: string;
};

const buildDiceReplyContent = ({
  achievementText,
  resultLines,
  unlockedFooter,
  doubleRollFooter,
  prestigeFooter,
}: BuildReplyContentInput): string => {
  return [achievementText, resultLines.join("\n"), unlockedFooter, doubleRollFooter, prestigeFooter]
    .filter((part): part is string => part.length > 0)
    .join("\n\n");
};

type GetMaxResultLengthForReplyInput = {
  achievementText: string;
  trailingParts: string[];
  messageLimit: number;
};

const getMaxResultLengthForReply = ({
  achievementText,
  trailingParts,
  messageLimit,
}: GetMaxResultLengthForReplyInput): number => {
  const otherParts = [achievementText, ...trailingParts].filter((part) => part.length > 0);
  const separatorsLength = otherParts.length * 2;
  const otherPartsLength = otherParts.reduce((total, part) => total + part.length, 0);
  return Math.max(0, messageLimit - separatorsLength - otherPartsLength);
};

const fitToLength = (value: string, maxLength: number): string => {
  if (maxLength < 1) {
    return "";
  }

  return value.length <= maxLength ? value : value.slice(0, maxLength);
};

const truncateToLimit = (content: string, maxLength: number): string => {
  if (content.length <= maxLength) {
    return content;
  }

  if (maxLength <= 3) {
    return ".".repeat(Math.max(0, maxLength));
  }

  return `${content.slice(0, maxLength - 3)}...`;
};

const getNewlyUnlockedAchievementIdsByRollSet = (
  rollPassAchievementIds: DiceAchievementId[][],
  previouslyEarnedAchievementIds: Set<DiceAchievementId>,
): DiceAchievementId[][] => {
  const newlyUnlockedByRollSet: DiceAchievementId[][] = [];
  for (const achievementIds of rollPassAchievementIds) {
    const unlockedForRollSet: DiceAchievementId[] = [];
    for (const achievementId of achievementIds) {
      if (previouslyEarnedAchievementIds.has(achievementId)) {
        continue;
      }

      previouslyEarnedAchievementIds.add(achievementId);
      unlockedForRollSet.push(achievementId);
    }

    newlyUnlockedByRollSet.push(unlockedForRollSet);
  }

  return newlyUnlockedByRollSet;
};

type GetHighlightedRollSetsInput = {
  formattedRollPasses: string[];
  allSameByRollSet: boolean[];
  newlyUnlockedAchievementIdsByRollSet: DiceAchievementId[][];
};

const getHighlightedRollSets = ({
  formattedRollPasses,
  allSameByRollSet,
  newlyUnlockedAchievementIdsByRollSet,
}: GetHighlightedRollSetsInput): HighlightedRollSet[] => {
  return formattedRollPasses.flatMap((formattedRolls, setIndex) => {
    const unlockedAchievementIds = newlyUnlockedAchievementIdsByRollSet[setIndex] ?? [];
    const hasMatchingDice = allSameByRollSet[setIndex] ?? false;
    if (unlockedAchievementIds.length < 1 && !hasMatchingDice) {
      return [];
    }

    return [{ setIndex, formattedRolls, unlockedAchievementIds, hasMatchingDice }];
  });
};

const getMatchingRollSummary = (matchCount: number, totalRollSets: number): string => {
  if (matchCount >= totalRollSets) {
    return "Every set had all matching dice.";
  }

  if (matchCount === 1) {
    return "One set had all matching dice.";
  }

  return `${matchCount} sets had all matching dice.`;
};

const getMatchLine = (matchCount: number, totalRollSets: number): string | null => {
  if (matchCount < 1) {
    return null;
  }

  return getMatchingRollSummary(matchCount, totalRollSets);
};
