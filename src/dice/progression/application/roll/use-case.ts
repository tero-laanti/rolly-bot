import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import {
  discordMessageCharacterLimit,
  formatDiscordRelativeTime,
} from "../../../../shared/discord";
import { formatDurationWords, truncateWithSuffix } from "../../../../shared/text";
import type { DiceAnalyticsRepository } from "../../../analytics/application/ports";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type {
  DicePermanentBonusesPort,
  DicePersonalChargeBonus,
} from "../../../inventory/application/ports";
import type {
  DiceItemDoubleRollStatus,
  DiceItemEffectsService,
} from "../../../inventory/application/item-effects-service";
import {
  createAchievementAnnouncement,
  mergeAchievementAnnouncements,
  type AchievementAnnouncement,
} from "../achievement-announcements";
import {
  getAchievementPipRewardTotal,
  getDiceAchievementsForRoll,
} from "../../../progression/domain/achievements-store";
import {
  getFirstDailyRollPipReward,
  getDiceCountIncreaseReward,
  getDicePrestigeBaseDiceCount,
  getUnlockedBanSlotsFromFame,
} from "../../../progression/domain/game-rules";
import { rollDieWithBans } from "../../../progression/domain/bans";
import type { DiceProgressionAchievementStats, DiceProgressionRepository } from "../ports";
import type { DicePvpRepository } from "../../../pvp/application/ports";
import type { RaidDiceRollPort } from "../../../raids/application/ports";
import {
  buildDiceRollReplyContent,
  formatMatchingRollSummary,
  formatRewardText,
} from "./reply-content";
import {
  buildDiceRollModifierFooter,
  createDiceRollModifierState,
  formatMultiplierFactor,
} from "../roll-status";

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
  achievementAnnouncements?: AchievementAnnouncement[];
};

type RunRollDiceUseCaseInput = {
  userId: string;
  userMention: string;
  raidThreadId?: string | null;
  source?: "manual" | "auto";
  nowMs?: number;
};

type RunRollDiceDependencies = {
  analytics: Pick<
    DiceAnalyticsRepository,
    "recordDiceRollAnalytics" | "resetDiceCountAnalyticsProgress"
  >;
  economy: Pick<DiceEconomyRepository, "applyFameDelta" | "getFame" | "grantDailyPipsIfEligible">;
  itemEffects: Pick<DiceItemEffectsService, "consumeOneDoubleRollUse" | "getItemDoubleRollStatus">;
  permanentBonuses: Pick<DicePermanentBonusesPort, "getPermanentBonuses">;
  progression: Pick<
    DiceProgressionRepository,
    | "awardAchievements"
    | "consumeDiceTemporaryEffectsForRoll"
    | "recordDiceProgressionAchievementStats"
    | "getActiveDiceTemporaryEffects"
    | "getDiceBans"
    | "getDiceCount"
    | "getDicePrestige"
    | "getDiceSides"
    | "getLastDiceRollAt"
    | "getLastPersonalDiceRollAt"
    | "getUserDiceAchievements"
    | "setDiceCount"
    | "setLastDiceRollAt"
    | "setLastPersonalDiceRollAt"
  >;
  pvp: Pick<DicePvpRepository, "getActiveDiceLockout" | "getActiveDoubleRoll">;
  raids?: Pick<RaidDiceRollPort, "applyDiceRoll">;
  unitOfWork: UnitOfWork;
};

const spamWindowMs = 2_000;
const diceSpamTracker = new Map<string, number>();

const formatDailyFirstRollBanner = (pipReward: number): string => {
  const pipLabel = pipReward === 1 ? "Pip" : "Pips";
  return `**Daily first roll bonus!** +${pipReward} ${pipLabel}.`;
};

export const createRunRollDiceUseCase = ({
  analytics,
  economy,
  itemEffects,
  permanentBonuses,
  progression,
  pvp,
  raids,
  unitOfWork,
}: RunRollDiceDependencies) => {
  return ({
    userId,
    userMention,
    raidThreadId = null,
    source = "manual",
    nowMs = Date.now(),
  }: RunRollDiceUseCaseInput): DiceRollResult => {
    const firstDailyRollPipReward = getFirstDailyRollPipReward();
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

    const diceCount = progression.getDiceCount(userId);
    const highestPrestige = progression.getDicePrestige(userId);
    const baseDiceCount = Math.max(1, diceCount);
    const pvpDoubleRollUntil = pvp.getActiveDoubleRoll(userId, nowMs);
    const itemDoubleRollStatus = itemEffects.getItemDoubleRollStatus(userId, nowMs);
    const permanentBonusSnapshot = permanentBonuses.getPermanentBonuses(userId);
    const lastDiceRollAt = progression.getLastDiceRollAt();
    const lastPersonalDiceRollAt = progression.getLastPersonalDiceRollAt(userId);
    const resolvedRollPassState = resolveRollPassState({
      prestige: highestPrestige,
      lastDiceRollAt,
      lastPersonalDiceRollAt,
      personalChargeBonus: permanentBonusSnapshot.personalCharge,
      pvpDoubleRollUntil,
      itemDoubleRollStatus,
      temporaryEffects: progression.getActiveDiceTemporaryEffects({
        userId,
        nowMs,
        commandName: "dice",
      }),
      nowMs,
    });
    const { rollPassCount, didUseChargeRoll } = resolvedRollPassState;
    const dieSides = progression.getDiceSides(userId);
    const fameBefore = economy.getFame(userId);
    const unlockedBansBefore =
      getUnlockedBanSlotsFromFame(fameBefore, diceCount, dieSides) +
      permanentBonusSnapshot.extraBanSlots;
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
    const hasDiceCountIncrease = allSameCount > 0;
    const diceCountIncrease = hasDiceCountIncrease ? 1 : 0;
    const nearDiceCountIncreaseRollCount = rollPasses.filter((rolls) =>
      isOneOffDiceCountIncreaseRoll(rolls),
    ).length;
    const diceRolledCount = rollPasses.reduce((total, rolls) => total + rolls.length, 0);
    const earnedAchievements = rollPassAchievementIds.flatMap((achievementIds) => achievementIds);

    const result = unitOfWork.runInTransaction(() => {
      const progressionAchievementStats = progression.recordDiceProgressionAchievementStats({
        userId,
        nearDiceCountIncreaseRollCount,
        chargeMultiplier: resolvedRollPassState.combinedChargeMultiplier,
        rollPassCount,
        diceCountIncreasesGained: diceCountIncrease,
      });
      const newlyEarned = progression.awardAchievements(userId, [
        ...earnedAchievements,
        ...getManualProgressionAchievementIds(progressionAchievementStats),
      ]);
      const baseAchievementPipReward = getAchievementPipRewardTotal(newlyEarned);
      const achievementPipReward =
        baseAchievementPipReward +
        Math.floor((baseAchievementPipReward * permanentBonusSnapshot.pipRewardBonusPercent) / 100);
      const diceCountAfter = diceCount + diceCountIncrease;
      if (hasDiceCountIncrease) {
        progression.setDiceCount({ userId, diceCount: diceCountAfter });
      }

      const fameReward = newlyEarned.length + diceCountIncrease * getDiceCountIncreaseReward();
      const fameAfter =
        fameReward > 0 ? economy.applyFameDelta({ userId, amount: fameReward }) : fameBefore;
      const dailyPipGrant =
        source === "manual" && firstDailyRollPipReward > 0
          ? economy.grantDailyPipsIfEligible({
              userId,
              amount: firstDailyRollPipReward,
              nowMs,
            })
          : {
              awarded: false,
              awardedAmount: 0,
              pips: 0,
              lastDailyPipRewardAt: null,
            };
      const dailyPipReward = dailyPipGrant.awardedAmount;
      const pipReward = achievementPipReward + dailyPipReward;

      analytics.recordDiceRollAnalytics({
        userId,
        rollSetCount: rollPassCount,
        nearDiceCountIncreaseRollCount,
        diceRolledCount,
        rollCommandCount: source === "manual" ? 1 : 0,
      });
      if (hasDiceCountIncrease) {
        analytics.resetDiceCountAnalyticsProgress(userId);
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
      progression.setLastPersonalDiceRollAt(userId, nowMs);

      return {
        newlyEarned,
        fameReward,
        pipReward,
        diceCountAfter,
        fameAfter,
        dailyFirstRollAwarded: dailyPipGrant.awarded,
        dailyFirstRollAwardedAmount: dailyPipGrant.awardedAmount,
      };
    });

    const chargeFactorText = formatMultiplierFactor(resolvedRollPassState.effectiveFactor);
    const rewardText = formatRewardText({
      fameReward: result.fameReward,
      pipReward: result.pipReward,
      hasDiceCountIncrease,
    });
    const dailyFirstRollBanner =
      source === "manual" && result.dailyFirstRollAwarded && result.dailyFirstRollAwardedAmount > 0
        ? formatDailyFirstRollBanner(result.dailyFirstRollAwardedAmount)
        : "";
    const multiplierFooter = buildDiceRollModifierFooter(resolvedRollPassState);
    const unlockedBansAfter =
      getUnlockedBanSlotsFromFame(result.fameAfter, result.diceCountAfter, dieSides) +
      permanentBonusSnapshot.extraBanSlots;
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
      result.diceCountAfter >= getDicePrestigeBaseDiceCount() &&
      diceCount < getDicePrestigeBaseDiceCount()
        ? "Prestige is now available. Use /prestige to advance."
        : "";

    const baseContent = buildDiceRollReplyContent({
      dailyFirstRollBanner,
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
    const bestRaidRollSet = getHighestRollSet(rollPasses);
    const raidDamage = getRollSetTotal(bestRaidRollSet);
    const raidResult =
      raidDamage > 0
        ? (raids?.applyDiceRoll({
            channelId: raidThreadId,
            userId,
            userMention,
            damage: raidDamage,
            bestRollSet: rollPasses.length > 1 ? bestRaidRollSet : null,
            nowMs,
          }) ?? null)
        : null;
    const content =
      raidResult && raidResult.kind !== "no-raid"
        ? appendRaidSummaryWithinLimit(baseContent, raidResult.summary)
        : baseContent;
    const achievementAnnouncements = mergeAchievementAnnouncements(
      [
        createAchievementAnnouncement(userId, result.newlyEarned),
        ...(raidResult?.kind === "applied" ? (raidResult.achievementAnnouncements ?? []) : []),
      ].flatMap((announcement) => (announcement ? [announcement] : [])),
    );

    return {
      content,
      ephemeral: false,
      autoRollClassification: buildAutoRollClassification({
        rewardText,
        matchCount: allSameCount,
        totalRollSets: rollPassCount,
        didUseChargeRoll,
        chargeFactorText,
        unlockedFooter,
        prestigeFooter,
      }),
      achievementAnnouncements,
    };
  };
};

const getManualProgressionAchievementIds = (stats: DiceProgressionAchievementStats): string[] => {
  const achievementIds: string[] = [];

  if (stats.rollCommandsTotal >= 1) {
    achievementIds.push("first-roll");
  }

  if (stats.diceCountIncreasesTotal >= 1) {
    achievementIds.push("first-extra-die");
  }

  if (stats.nearDiceCountIncreaseRollsTotal >= 1) {
    achievementIds.push("near-extra-die-1");
  }
  if (stats.nearDiceCountIncreaseRollsTotal >= 10) {
    achievementIds.push("near-extra-die-10");
  }
  if (stats.nearDiceCountIncreaseRollsTotal >= 25) {
    achievementIds.push("near-extra-die-25");
  }
  if (stats.nearDiceCountIncreaseRollsTotal >= 100) {
    achievementIds.push("near-extra-die-100");
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

const resolveRollPassState = ({
  prestige,
  lastDiceRollAt,
  lastPersonalDiceRollAt,
  personalChargeBonus,
  pvpDoubleRollUntil,
  itemDoubleRollStatus,
  temporaryEffects,
  nowMs,
}: {
  prestige: number;
  lastDiceRollAt: number | null;
  lastPersonalDiceRollAt: number | null;
  personalChargeBonus: DicePersonalChargeBonus;
  pvpDoubleRollUntil: number | null;
  itemDoubleRollStatus: DiceItemDoubleRollStatus;
  temporaryEffects: ReturnType<DiceProgressionRepository["getActiveDiceTemporaryEffects"]>;
  nowMs: number;
}): ReturnType<typeof createDiceRollModifierState> => {
  return createDiceRollModifierState({
    prestige,
    lastGlobalRollAtMs: lastDiceRollAt,
    lastPersonalRollAtMs: lastPersonalDiceRollAt,
    personalChargeBonus,
    pvpDoubleRollUntilMs: pvpDoubleRollUntil,
    itemDoubleRollStatus,
    temporaryEffects,
    nowMs,
  });
};

const buildAutoRollClassification = ({
  rewardText,
  matchCount,
  totalRollSets,
  didUseChargeRoll,
  chargeFactorText,
  unlockedFooter,
  prestigeFooter,
}: {
  rewardText: string;
  matchCount: number;
  totalRollSets: number;
  didUseChargeRoll: boolean;
  chargeFactorText: string;
  unlockedFooter: string;
  prestigeFooter: string;
}): DiceAutoRollClassification => {
  const summaryParts: string[] = [];

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

const getHighestRollSet = (rollPasses: number[][]): number[] => {
  return rollPasses.reduce((bestRollSet, rolls) => {
    return getRollSetTotal(rolls) > getRollSetTotal(bestRollSet) ? rolls : bestRollSet;
  }, rollPasses[0] ?? []);
};

const getRollSetTotal = (rolls: readonly number[]): number => {
  return rolls.reduce((rollTotal, roll) => rollTotal + roll, 0);
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

const isOneOffDiceCountIncreaseRoll = (rolls: number[]): boolean => {
  if (rolls.length < 2) {
    return false;
  }

  const counts = new Map<number, number>();
  for (const roll of rolls) {
    counts.set(roll, (counts.get(roll) ?? 0) + 1);
  }

  return Array.from(counts.values()).some((count) => count === rolls.length - 1);
};
