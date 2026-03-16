import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DiceAnalyticsRepository } from "../../../analytics/application/ports";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceItemEffectsService } from "../../../inventory/application/item-effects-service";
import { getDiceAchievementsForRoll } from "../../../progression/domain/achievements-store";
import {
  getBaseRollPassCount,
  getDiceLevelUpReward,
  getDiceMaxRollPassCount,
  getDicePrestigeBaseLevel,
  getDoubleBuffRollPassCount,
  getUnlockedBanSlotsFromFame,
} from "../../../progression/domain/game-rules";
import { rollDieWithBans } from "../../../progression/domain/bans";
import { getDiceChargeMultiplier } from "../../../progression/domain/charge";
import type { DiceProgressionRepository } from "../ports";
import type { DicePvpRepository } from "../../../pvp/application/ports";
import {
  buildDiceRollReplyContent,
  formatAchievementText,
  formatRewardText,
} from "./reply-content";

export type DiceAutoRollClassification =
  | {
      kind: "none";
    }
  | {
      kind: "blocked" | "interesting";
      summary: string;
    };

export type DiceRollResult = {
  content: string;
  ephemeral: boolean;
  autoRollClassification: DiceAutoRollClassification;
};

type RunRollDiceUseCaseInput = {
  userId: string;
  userMention: string;
  nowMs?: number;
};

type RunRollDiceDependencies = {
  analytics: Pick<
    DiceAnalyticsRepository,
    "recordDiceRollAnalytics" | "resetDiceLevelAnalyticsProgress"
  >;
  economy: Pick<DiceEconomyRepository, "applyFameDelta" | "getFame">;
  itemEffects: Pick<DiceItemEffectsService, "consumeOneDoubleRollUse" | "getItemDoubleRollStatus">;
  progression: Pick<
    DiceProgressionRepository,
    | "awardAchievements"
    | "consumeDiceTemporaryEffectsForRoll"
    | "getActiveDiceTemporaryEffects"
    | "getDiceBans"
    | "getDiceLevel"
    | "getDicePrestige"
    | "getDiceSides"
    | "getLastDiceRollAt"
    | "getUserDiceAchievements"
    | "setDiceLevel"
    | "setLastDiceRollAt"
  >;
  pvp: Pick<DicePvpRepository, "getActiveDiceLockout" | "getActiveDoubleRoll">;
  unitOfWork: UnitOfWork;
};

const spamWindowMs = 2_000;
const diceSpamTracker = new Map<string, number>();

export const createRunRollDiceUseCase = ({
  analytics,
  economy,
  itemEffects,
  progression,
  pvp,
  unitOfWork,
}: RunRollDiceDependencies) => {
  return ({ userId, userMention, nowMs = Date.now() }: RunRollDiceUseCaseInput): DiceRollResult => {
    const lockoutUntil = pvp.getActiveDiceLockout(userId, nowMs);
    if (lockoutUntil) {
      const content = `${userMention}, you can play again ${formatRelativeTime(lockoutUntil)}.`;
      return {
        content,
        ephemeral: false,
        autoRollClassification: {
          kind: "blocked",
          summary: summarizeAutoRollText(content),
        },
      };
    }

    const lastSpamRollAt = diceSpamTracker.get(userId);
    diceSpamTracker.set(userId, nowMs);
    if (lastSpamRollAt !== undefined && nowMs - lastSpamRollAt <= spamWindowMs) {
      const content = `${userMention} stop spamming!`;
      return {
        content,
        ephemeral: false,
        autoRollClassification: {
          kind: "blocked",
          summary: content,
        },
      };
    }

    const level = progression.getDiceLevel(userId);
    const highestPrestige = progression.getDicePrestige(userId);
    const baseDiceCount = Math.max(1, level);
    const pvpDoubleRollUntil = pvp.getActiveDoubleRoll(userId, nowMs);
    const itemDoubleRollStatus = itemEffects.getItemDoubleRollStatus(userId, nowMs);
    const lastDiceRollAt = progression.getLastDiceRollAt();
    const chargeMultiplier = getDiceChargeMultiplier(lastDiceRollAt, nowMs);
    const baseRollPassCount = getBaseRollPassCount(highestPrestige);
    const hasActiveDoubleRoll = Boolean(
      (pvpDoubleRollUntil && pvpDoubleRollUntil > nowMs) || itemDoubleRollStatus.isActive,
    );
    const doubleBuffRollPassCount = hasActiveDoubleRoll
      ? getDoubleBuffRollPassCount(highestPrestige)
      : baseRollPassCount;
    const temporaryEffectsRollSummary = summarizeRollPassEffects(
      progression.getActiveDiceTemporaryEffects({
        userId,
        nowMs,
        commandName: "dice",
      }),
    );
    const nonChargeRollPassCount = Math.max(
      1,
      Math.floor(doubleBuffRollPassCount * temporaryEffectsRollSummary.effectiveFactor),
    );
    const chargeRollPassCount = baseRollPassCount * chargeMultiplier;
    const uncappedRollPassCount =
      chargeMultiplier > 1
        ? Math.max(chargeRollPassCount, nonChargeRollPassCount)
        : nonChargeRollPassCount;
    const rollPassCount = Math.max(1, Math.min(getDiceMaxRollPassCount(), uncappedRollPassCount));
    const didChargePathWin = chargeMultiplier > 1 && chargeRollPassCount >= nonChargeRollPassCount;
    const dieSides = progression.getDiceSides(userId);
    const fameBefore = economy.getFame(userId);
    const unlockedBansBefore = getUnlockedBanSlotsFromFame(fameBefore, level, dieSides);
    const bans = progression.getDiceBans(userId);

    const rollPasses = Array.from({ length: rollPassCount }, () =>
      Array.from({ length: baseDiceCount }, (_, index) => {
        const dieIndex = index + 1;
        const bannedValues = bans.get(dieIndex) ?? null;
        return rollDieWithBans(bannedValues, dieSides);
      }),
    );

    const rollPassAchievementIds = rollPasses.map((rolls) =>
      getDiceAchievementsForRoll(rolls, nowMs),
    );
    const previouslyEarnedAchievementIds = new Set(progression.getUserDiceAchievements(userId));
    const allSameCount = rollPasses.filter((rolls) =>
      rolls.every((roll) => roll === rolls[0]),
    ).length;
    const hasLevelUp = allSameCount > 0;
    const levelIncrease = hasLevelUp ? 1 : 0;
    const nearLevelupRollCount = rollPasses.filter((rolls) => isOneOffLevelupRoll(rolls)).length;
    const diceRolledCount = rollPasses.reduce((total, rolls) => total + rolls.length, 0);
    const earnedAchievements = rollPassAchievementIds.flatMap((achievementIds) => achievementIds);

    const result = unitOfWork.runInTransaction(() => {
      const newlyEarned = progression.awardAchievements(userId, earnedAchievements);
      const levelAfter = level + levelIncrease;
      if (hasLevelUp) {
        progression.setDiceLevel({ userId, level: levelAfter });
      }

      const totalReward = newlyEarned.length + levelIncrease * getDiceLevelUpReward();
      const fameAfter =
        totalReward > 0 ? economy.applyFameDelta({ userId, amount: totalReward }) : fameBefore;

      analytics.recordDiceRollAnalytics({
        userId,
        rollSetCount: rollPassCount,
        nearLevelupRollCount,
        diceRolledCount,
      });
      if (hasLevelUp) {
        analytics.resetDiceLevelAnalyticsProgress(userId);
      }

      if (!didChargePathWin && temporaryEffectsRollSummary.hasApplicableEffects) {
        progression.consumeDiceTemporaryEffectsForRoll({
          userId,
          commandName: "dice",
          rollsConsumed: 1,
          nowMs,
        });
      }
      if (itemDoubleRollStatus.remainingUses > 0) {
        itemEffects.consumeOneDoubleRollUse(userId, nowMs);
      }
      progression.setLastDiceRollAt(nowMs);

      return { newlyEarned, totalReward, levelAfter, fameAfter };
    });

    const achievementText = formatAchievementText(result.newlyEarned);
    const rewardText = formatRewardText(result.totalReward, hasLevelUp);
    const unlockedBansAfter = getUnlockedBanSlotsFromFame(
      result.fameAfter,
      result.levelAfter,
      dieSides,
    );
    const unlockedFooter = unlockedBansAfter > unlockedBansBefore ? "New ban slot unlocked." : "";
    const remainingItemDoubleRollUses =
      itemDoubleRollStatus.remainingUses > 0 ? itemDoubleRollStatus.remainingUses - 1 : 0;
    const doubleRollFooterParts: string[] = [];
    if (pvpDoubleRollUntil && pvpDoubleRollUntil > nowMs) {
      doubleRollFooterParts.push(
        `PvP double buff remaining: ${formatRemainingTime(pvpDoubleRollUntil - nowMs)}.`,
      );
    }
    if (itemDoubleRollStatus.expiresAtMs && itemDoubleRollStatus.expiresAtMs > nowMs) {
      doubleRollFooterParts.push(
        `Item double buff remaining: ${formatRemainingTime(itemDoubleRollStatus.expiresAtMs - nowMs)}.`,
      );
    }
    if (remainingItemDoubleRollUses > 0) {
      doubleRollFooterParts.push(`Item double rolls remaining: ${remainingItemDoubleRollUses}.`);
    }
    const doubleRollFooter = doubleRollFooterParts.join(" ");
    const prestigeFooter =
      result.levelAfter >= getDicePrestigeBaseLevel() && level < getDicePrestigeBaseLevel()
        ? "Prestige is now available. Use /dice-prestige to advance."
        : "";

    const content = buildDiceRollReplyContent({
      achievementText,
      unlockedFooter,
      doubleRollFooter,
      prestigeFooter,
      chargeMultiplier,
      didChargePathWin,
      rollPasses,
      rollPassAchievementIds,
      previouslyEarnedAchievementIds,
      matchCount: allSameCount,
      rewardText,
    });

    return {
      content,
      ephemeral: false,
      autoRollClassification: buildAutoRollClassification({
        achievementText,
        rewardText,
        matchCount: allSameCount,
        totalRollSets: rollPassCount,
        didChargePathWin,
        chargeMultiplier,
        unlockedFooter,
        prestigeFooter,
      }),
    };
  };
};

const summarizeRollPassEffects = (
  effects: ReturnType<DiceProgressionRepository["getActiveDiceTemporaryEffects"]>,
) => {
  let multiplier = 1;
  let divisor = 1;
  let hasApplicableEffects = false;

  for (const effect of effects) {
    if (effect.effectCode === "roll-pass-multiplier" && effect.kind === "positive") {
      multiplier *= Math.max(1, effect.magnitude);
      hasApplicableEffects = true;
      continue;
    }

    if (effect.effectCode === "roll-pass-divisor" && effect.kind === "negative") {
      divisor *= Math.max(1, effect.magnitude);
      hasApplicableEffects = true;
    }
  }

  const normalizedMultiplier = Math.max(1, Math.floor(multiplier));
  const normalizedDivisor = Math.max(1, Math.floor(divisor));

  return {
    effectiveFactor: normalizedMultiplier / normalizedDivisor,
    hasApplicableEffects,
  };
};

const buildAutoRollClassification = ({
  achievementText,
  rewardText,
  matchCount,
  totalRollSets,
  didChargePathWin,
  chargeMultiplier,
  unlockedFooter,
  prestigeFooter,
}: {
  achievementText: string;
  rewardText: string;
  matchCount: number;
  totalRollSets: number;
  didChargePathWin: boolean;
  chargeMultiplier: number;
  unlockedFooter: string;
  prestigeFooter: string;
}): DiceAutoRollClassification => {
  const summaryParts: string[] = [];

  if (achievementText) {
    summaryParts.push(achievementText);
  }
  if (rewardText) {
    summaryParts.push(rewardText);
  }
  if (matchCount > 0) {
    summaryParts.push(getMatchSummary(matchCount, totalRollSets));
  }
  if (didChargePathWin) {
    summaryParts.push(`${chargeMultiplier}x Dice charge!`);
  }
  if (unlockedFooter) {
    summaryParts.push(unlockedFooter);
  }
  if (prestigeFooter) {
    summaryParts.push(prestigeFooter);
  }

  if (summaryParts.length < 1) {
    return { kind: "none" };
  }

  return {
    kind: "interesting",
    summary: summarizeAutoRollText(summaryParts.join(" | ")),
  };
};

const getMatchSummary = (matchCount: number, totalRollSets: number): string => {
  if (matchCount >= totalRollSets) {
    return "Every set had all matching dice.";
  }

  if (matchCount === 1) {
    return "One set had all matching dice.";
  }

  return `${matchCount} sets had all matching dice.`;
};

const summarizeAutoRollText = (content: string): string => {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 220) {
    return singleLine;
  }

  return `${singleLine.slice(0, 217)}...`;
};

const formatRelativeTime = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
};

const formatRemainingTime = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${formatUnit(hours, "hour")} ${formatUnit(minutes, "minute")} ${formatUnit(seconds, "second")}`;
  }
  if (minutes > 0) {
    return `${formatUnit(minutes, "minute")} ${formatUnit(seconds, "second")}`;
  }

  return formatUnit(seconds, "second");
};

const formatUnit = (value: number, unit: string): string => {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
};

const isOneOffLevelupRoll = (rolls: number[]): boolean => {
  if (rolls.length < 2) {
    return false;
  }

  const counts = new Map<number, number>();
  for (const roll of rolls) {
    counts.set(roll, (counts.get(roll) ?? 0) + 1);
  }

  return Array.from(counts.values()).some((count) => count === rolls.length - 1);
};
