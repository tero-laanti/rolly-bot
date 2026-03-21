import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import {
  discordMessageCharacterLimit,
  formatDiscordRelativeTime,
} from "../../../../shared/discord";
import { formatDurationWords, truncateWithSuffix } from "../../../../shared/text";
import type { DiceAnalyticsRepository } from "../../../analytics/application/ports";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceItemEffectsService } from "../../../inventory/application/item-effects-service";
import {
  getAchievementPipRewardTotal,
  getDiceAchievementsForRoll,
} from "../../../progression/domain/achievements-store";
import {
  getBaseRollPassCount,
  getDiceLevelUpReward,
  getDiceMaxRollPassCount,
  getDicePrestigeBaseLevel,
  getDoubleBuffRollPassCount,
  getFirstDailyRollPipReward,
  getUnlockedBanSlotsFromFame,
} from "../../../progression/domain/game-rules";
import { rollDieWithBans } from "../../../progression/domain/bans";
import { getDiceChargeMultiplier } from "../../../progression/domain/charge";
import type { DiceProgressionAchievementStats, DiceProgressionRepository } from "../ports";
import type { DicePvpRepository } from "../../../pvp/application/ports";
import type { RaidDiceRollPort } from "../../../raids/application/ports";
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

type RollPassEffectSummary = {
  multiplier: number;
  divisor: number;
  effectiveFactor: number;
  hasApplicableEffects: boolean;
};

type ResolvedRollPassState = {
  rollPassCount: number;
  didUseChargeRoll: boolean;
  effectiveFactor: number;
  hasActivePvpDoubleRoll: boolean;
  hasActiveItemDoubleRoll: boolean;
  temporaryEffectsRollSummary: RollPassEffectSummary;
};

type RunRollDiceUseCaseInput = {
  userId: string;
  userMention: string;
  raidThreadId?: string | null;
  nowMs?: number;
};

type RunRollDiceDependencies = {
  analytics: Pick<
    DiceAnalyticsRepository,
    "recordDiceRollAnalytics" | "resetDiceLevelAnalyticsProgress"
  >;
  economy: Pick<DiceEconomyRepository, "applyFameDelta" | "getFame" | "grantDailyPipsIfEligible">;
  itemEffects: Pick<DiceItemEffectsService, "consumeOneDoubleRollUse" | "getItemDoubleRollStatus">;
  progression: Pick<
    DiceProgressionRepository,
    | "awardAchievements"
    | "consumeDiceTemporaryEffectsForRoll"
    | "recordDiceProgressionAchievementStats"
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
  raids?: Pick<RaidDiceRollPort, "applyDiceRoll">;
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
  raids,
  unitOfWork,
}: RunRollDiceDependencies) => {
  return ({
    userId,
    userMention,
    raidThreadId = null,
    nowMs = Date.now(),
  }: RunRollDiceUseCaseInput): DiceRollResult => {
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
    const hasActivePvpDoubleRoll = Boolean(pvpDoubleRollUntil && pvpDoubleRollUntil > nowMs);
    const resolvedRollPassState = resolveRollPassState({
      prestige: highestPrestige,
      chargeMultiplier,
      hasActivePvpDoubleRoll,
      hasActiveItemDoubleRoll: itemDoubleRollStatus.isActive,
      temporaryEffects: progression.getActiveDiceTemporaryEffects({
        userId,
        nowMs,
        commandName: "dice",
      }),
    });
    const { rollPassCount, didUseChargeRoll } = resolvedRollPassState;
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
      const progressionAchievementStats = progression.recordDiceProgressionAchievementStats({
        userId,
        nearLevelupRollCount,
        chargeMultiplier,
        rollPassCount,
        levelUpsGained: levelIncrease,
      });
      const newlyEarned = progression.awardAchievements(userId, [
        ...earnedAchievements,
        ...getManualProgressionAchievementIds(progressionAchievementStats),
      ]);
      const achievementPipReward = getAchievementPipRewardTotal(newlyEarned);
      const levelAfter = level + levelIncrease;
      if (hasLevelUp) {
        progression.setDiceLevel({ userId, level: levelAfter });
      }

      const fameReward = newlyEarned.length + levelIncrease * getDiceLevelUpReward();
      const fameAfter =
        fameReward > 0 ? economy.applyFameDelta({ userId, amount: fameReward }) : fameBefore;
      const firstDailyRollPipReward = getFirstDailyRollPipReward();
      const dailyPipGrant = economy.grantDailyPipsIfEligible({
        userId,
        amount: firstDailyRollPipReward,
        nowMs,
      });
      const dailyPipReward = dailyPipGrant.awarded ? firstDailyRollPipReward : 0;
      const pipReward = achievementPipReward + dailyPipReward;

      analytics.recordDiceRollAnalytics({
        userId,
        rollSetCount: rollPassCount,
        nearLevelupRollCount,
        diceRolledCount,
      });
      if (hasLevelUp) {
        analytics.resetDiceLevelAnalyticsProgress(userId);
      }

      if (
        !didUseChargeRoll &&
        resolvedRollPassState.temporaryEffectsRollSummary.hasApplicableEffects
      ) {
        progression.consumeDiceTemporaryEffectsForRoll({
          userId,
          commandName: "dice",
          rollsConsumed: 1,
          nowMs,
        });
      }
      if (!didUseChargeRoll && itemDoubleRollStatus.remainingUses > 0) {
        itemEffects.consumeOneDoubleRollUse(userId, nowMs);
      }
      progression.setLastDiceRollAt(nowMs);

      return { newlyEarned, fameReward, pipReward, levelAfter, fameAfter };
    });

    const achievementText = formatAchievementText(result.newlyEarned);
    const chargeFactorText = formatMultiplierFactor(resolvedRollPassState.effectiveFactor);
    const rewardText = formatRewardText({
      fameReward: result.fameReward,
      pipReward: result.pipReward,
      hasLevelUp,
    });
    const multiplierFooter = buildRollModifierFooter(resolvedRollPassState);
    const unlockedBansAfter = getUnlockedBanSlotsFromFame(
      result.fameAfter,
      result.levelAfter,
      dieSides,
    );
    const unlockedFooter = unlockedBansAfter > unlockedBansBefore ? "New ban slot unlocked." : "";
    const remainingItemDoubleRollUses =
      !didUseChargeRoll && itemDoubleRollStatus.remainingUses > 0
        ? itemDoubleRollStatus.remainingUses - 1
        : itemDoubleRollStatus.remainingUses;
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

    const baseContent = buildDiceRollReplyContent({
      achievementText,
      multiplierFooter,
      unlockedFooter,
      doubleRollFooter,
      prestigeFooter,
      chargeFactorText,
      didUseChargeRoll,
      rollPasses,
      rollPassAchievementIds,
      previouslyEarnedAchievementIds,
      matchCount: allSameCount,
      rewardText,
    });
    const raidDamage = rollPasses.reduce(
      (total, rolls) => total + rolls.reduce((rollTotal, roll) => rollTotal + roll, 0),
      0,
    );
    const raidResult =
      raidDamage > 0
        ? (raids?.applyDiceRoll({
            channelId: raidThreadId,
            userId,
            userMention,
            damage: raidDamage,
            nowMs,
          }) ?? null)
        : null;
    const content =
      raidResult && raidResult.kind !== "no-raid"
        ? appendRaidSummaryWithinLimit(baseContent, raidResult.summary)
        : baseContent;

    return {
      content,
      ephemeral: false,
      autoRollClassification: buildAutoRollClassification({
        achievementText,
        rewardText,
        matchCount: allSameCount,
        totalRollSets: rollPassCount,
        didUseChargeRoll,
        chargeFactorText,
        unlockedFooter,
        prestigeFooter,
      }),
    };
  };
};

const getManualProgressionAchievementIds = (stats: DiceProgressionAchievementStats): string[] => {
  const achievementIds: string[] = [];

  if (stats.rollCommandsTotal >= 1) {
    achievementIds.push("first-roll");
  }

  if (stats.levelUpsTotal >= 1) {
    achievementIds.push("first-level-up");
  }

  if (stats.nearLevelupRollsTotal >= 1) {
    achievementIds.push("near-level-up-1");
  }
  if (stats.nearLevelupRollsTotal >= 10) {
    achievementIds.push("near-level-up-10");
  }
  if (stats.nearLevelupRollsTotal >= 25) {
    achievementIds.push("near-level-up-25");
  }
  if (stats.nearLevelupRollsTotal >= 100) {
    achievementIds.push("near-level-up-100");
  }

  if (stats.highestChargeMultiplier >= 2) {
    achievementIds.push("charge-2");
  }
  if (stats.highestChargeMultiplier >= 50) {
    achievementIds.push("charge-50");
  }
  if (stats.highestChargeMultiplier >= 100) {
    achievementIds.push("charge-100");
  }

  if (stats.highestRollPassCount >= 2) {
    achievementIds.push("peak-goblin");
  }
  if (stats.highestRollPassCount >= 10) {
    achievementIds.push("roll-pass-10");
  }
  if (stats.highestRollPassCount >= 25) {
    achievementIds.push("roll-pass-25");
  }

  return achievementIds;
};

const summarizeRollPassEffects = (
  effects: ReturnType<DiceProgressionRepository["getActiveDiceTemporaryEffects"]>,
): RollPassEffectSummary => {
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

const resolveRollPassState = ({
  prestige,
  chargeMultiplier,
  hasActivePvpDoubleRoll,
  hasActiveItemDoubleRoll,
  temporaryEffects,
}: {
  prestige: number;
  chargeMultiplier: number;
  hasActivePvpDoubleRoll: boolean;
  hasActiveItemDoubleRoll: boolean;
  temporaryEffects: ReturnType<DiceProgressionRepository["getActiveDiceTemporaryEffects"]>;
}): ResolvedRollPassState => {
  const baseRollPassCount = getBaseRollPassCount(prestige);
  const hasActiveDoubleRoll = hasActivePvpDoubleRoll || hasActiveItemDoubleRoll;
  const doubleBuffRollPassCount = hasActiveDoubleRoll
    ? getDoubleBuffRollPassCount(prestige)
    : baseRollPassCount;
  const temporaryEffectsRollSummary = summarizeRollPassEffects(temporaryEffects);
  const nonChargeRollPassCount = Math.max(
    1,
    Math.floor(doubleBuffRollPassCount * temporaryEffectsRollSummary.effectiveFactor),
  );
  const didUseChargeRoll = chargeMultiplier > 1;
  const winningRollPassCount = didUseChargeRoll
    ? baseRollPassCount * chargeMultiplier
    : nonChargeRollPassCount;
  const rollPassCount = Math.max(1, Math.min(getDiceMaxRollPassCount(), winningRollPassCount));

  return {
    rollPassCount,
    didUseChargeRoll,
    effectiveFactor: rollPassCount / baseRollPassCount,
    hasActivePvpDoubleRoll,
    hasActiveItemDoubleRoll,
    temporaryEffectsRollSummary,
  };
};

const buildRollModifierFooter = ({
  hasActivePvpDoubleRoll,
  hasActiveItemDoubleRoll,
  temporaryEffectsRollSummary,
  didUseChargeRoll,
  effectiveFactor,
}: ResolvedRollPassState): string => {
  const modifierParts: string[] = [];

  if (hasActivePvpDoubleRoll || hasActiveItemDoubleRoll) {
    const doubleRollSources: string[] = [];
    if (hasActivePvpDoubleRoll) {
      doubleRollSources.push("PvP");
    }
    if (hasActiveItemDoubleRoll) {
      doubleRollSources.push("item");
    }

    modifierParts.push(
      doubleRollSources.length === 1
        ? `${doubleRollSources[0]} double ×2`
        : `double-roll buff ×2 (${doubleRollSources.join(" + ")})`,
    );
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

  if (didUseChargeRoll) {
    return `Other active roll modifiers: ${modifierParts.join(" · ")}.`;
  }

  return `Roll modifiers: ${modifierParts.join(" · ")} → effective ×${formatMultiplierFactor(effectiveFactor)}.`;
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
  didUseChargeRoll,
  chargeFactorText,
  unlockedFooter,
  prestigeFooter,
}: {
  achievementText: string;
  rewardText: string;
  matchCount: number;
  totalRollSets: number;
  didUseChargeRoll: boolean;
  chargeFactorText: string;
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
  if (didUseChargeRoll) {
    summaryParts.push(`${chargeFactorText}x Dice charge!`);
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

const appendRaidSummaryWithinLimit = (baseContent: string, raidSummary: string): string => {
  const separator = "\n\n";
  const combined = `${baseContent}${separator}${raidSummary}`;
  if (combined.length <= discordMessageCharacterLimit) {
    return combined;
  }

  const normalizedSummary = truncateWithSuffix(raidSummary, discordMessageCharacterLimit, "...");
  const maxBaseLength = discordMessageCharacterLimit - normalizedSummary.length - separator.length;
  if (maxBaseLength <= 0) {
    return normalizedSummary;
  }

  const truncatedBase = truncateWithSuffix(baseContent, maxBaseLength, "...");
  return `${truncatedBase}${separator}${normalizedSummary}`;
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
