import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import { formatDiscordRelativeTime } from "../../../../shared/discord";
import { formatDurationWords, truncateWithSuffix } from "../../../../shared/text";
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
  formatMatchingRollSummary,
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
      const content = `${userMention}, you can play again ${formatDiscordRelativeTime(lockoutUntil)}.`;
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
    const multiplierFooter = buildRollModifierFooter({
      hasActivePvpDoubleRoll: Boolean(pvpDoubleRollUntil && pvpDoubleRollUntil > nowMs),
      hasActiveItemDoubleRoll: itemDoubleRollStatus.isActive,
      temporaryEffectsRollSummary,
      didChargePathWin,
    });
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
      multiplierFooter,
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
    multiplier: normalizedMultiplier,
    divisor: normalizedDivisor,
    effectiveFactor: normalizedMultiplier / normalizedDivisor,
    hasApplicableEffects,
  };
};

const buildRollModifierFooter = ({
  hasActivePvpDoubleRoll,
  hasActiveItemDoubleRoll,
  temporaryEffectsRollSummary,
  didChargePathWin,
}: {
  hasActivePvpDoubleRoll: boolean;
  hasActiveItemDoubleRoll: boolean;
  temporaryEffectsRollSummary: ReturnType<typeof summarizeRollPassEffects>;
  didChargePathWin: boolean;
}): string => {
  const modifierParts: string[] = [];

  if (hasActivePvpDoubleRoll) {
    modifierParts.push("PvP double ×2");
  }

  if (hasActiveItemDoubleRoll) {
    modifierParts.push("item double ×2");
  }

  if (temporaryEffectsRollSummary.multiplier > 1) {
    modifierParts.push(
      `temporary ${temporaryEffectsRollSummary.multiplier === 2 ? "buff" : "buffs"} ×${temporaryEffectsRollSummary.multiplier}`,
    );
  }

  if (temporaryEffectsRollSummary.divisor > 1) {
    modifierParts.push(
      `temporary ${temporaryEffectsRollSummary.divisor === 2 ? "penalty" : "penalties"} ÷${temporaryEffectsRollSummary.divisor}`,
    );
  }

  if (modifierParts.length < 1) {
    return "";
  }

  if (didChargePathWin) {
    return `Other active roll modifiers: ${modifierParts.join(" · ")}.`;
  }

  const totalFactor =
    (hasActivePvpDoubleRoll ? 2 : 1) *
    (hasActiveItemDoubleRoll ? 2 : 1) *
    temporaryEffectsRollSummary.effectiveFactor;

  return `Roll modifiers: ${modifierParts.join(" · ")} → effective ×${formatMultiplierFactor(totalFactor)}.`;
};

const formatMultiplierFactor = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "1";
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value
    .toFixed(2)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
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
    summaryParts.push(formatMatchingRollSummary(matchCount, totalRollSets));
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

const summarizeAutoRollText = (content: string): string => {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return truncateWithSuffix(singleLine, 220, "...");
};

const formatRemainingTime = (durationMs: number): string => {
  return formatDurationWords(durationMs);
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
