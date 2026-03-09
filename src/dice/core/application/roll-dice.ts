import type { SqliteDatabase } from "../../../shared/db";
import { applyFameDelta, getFame } from "../../../shared/economy";
import {
  awardAchievements,
  getDiceAchievementsForRoll,
  getUserDiceAchievements,
} from "../domain/achievements-store";
import {
  getBaseRollPassCount,
  getDiceLevelUpReward,
  getDiceMaxRollPassCount,
  getDicePrestigeBaseLevel,
  getDoubleBuffRollPassCount,
  getUnlockedBanSlotsFromFame,
} from "../domain/balance";
import { getDiceBans, rollDieWithBans } from "../domain/bans";
import { getDiceChargeMultiplier, getLastDiceRollAt, setLastDiceRollAt } from "../domain/charge";
import { recordDiceRollAnalytics, resetDiceLevelAnalyticsProgress } from "../domain/analytics";
import { getActiveDiceLockout, getActiveDoubleRoll } from "../domain/pvp";
import {
  getDiceLevel,
  getDicePrestige,
  getDiceSides,
  setDiceLevel,
} from "../domain/prestige";
import {
  consumeDiceTemporaryEffectsForRoll,
  getRollPassMultiplierFromTemporaryEffects,
} from "../domain/temporary-effects";
import {
  buildDiceRollReplyContent,
  formatAchievementText,
  formatRewardText,
} from "../presentation/dice-roll-output";

type RunRollDiceUseCaseInput = {
  db: SqliteDatabase;
  userId: string;
  userMention: string;
  nowMs?: number;
};

type RollDiceResponse = {
  content: string;
  ephemeral: boolean;
};

const spamWindowMs = 2_000;
const diceSpamTracker = new Map<string, number>();

export const runRollDiceUseCase = ({
  db,
  userId,
  userMention,
  nowMs = Date.now(),
}: RunRollDiceUseCaseInput): RollDiceResponse => {
  const lockoutUntil = getActiveDiceLockout(db, userId, nowMs);
  if (lockoutUntil) {
    return {
      content: `${userMention}, you can play again ${formatRelativeTime(lockoutUntil)}.`,
      ephemeral: false,
    };
  }

  const lastSpamRollAt = diceSpamTracker.get(userId);
  diceSpamTracker.set(userId, nowMs);
  if (lastSpamRollAt !== undefined && nowMs - lastSpamRollAt <= spamWindowMs) {
    return {
      content: `${userMention} stop spamming!`,
      ephemeral: false,
    };
  }

  const level = getDiceLevel(db, userId);
  const highestPrestige = getDicePrestige(db, userId);
  const baseDiceCount = Math.max(1, level);
  const doubleRollUntil = getActiveDoubleRoll(db, userId, nowMs);
  const lastDiceRollAt = getLastDiceRollAt(db);
  const chargeMultiplier = getDiceChargeMultiplier(lastDiceRollAt, nowMs);
  const baseRollPassCount = getBaseRollPassCount(highestPrestige);
  const doubleBuffRollPassCount = doubleRollUntil
    ? getDoubleBuffRollPassCount(highestPrestige)
    : baseRollPassCount;
  const temporaryEffectsRollSummary = getRollPassMultiplierFromTemporaryEffects(db, userId, nowMs);
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
  const dieSides = getDiceSides(db, userId);
  const fameBefore = getFame(db, userId);
  const unlockedBansBefore = getUnlockedBanSlotsFromFame(fameBefore, level, dieSides);
  const bans = getDiceBans(db, userId);

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
  const previouslyEarnedAchievementIds = new Set(getUserDiceAchievements(db, userId));
  const allSameCount = rollPasses.filter((rolls) => rolls.every((roll) => roll === rolls[0]))
    .length;
  const hasLevelUp = allSameCount > 0;
  const levelIncrease = hasLevelUp ? 1 : 0;
  const nearLevelupRollCount = rollPasses.filter((rolls) => isOneOffLevelupRoll(rolls)).length;
  const diceRolledCount = rollPasses.reduce((total, rolls) => total + rolls.length, 0);
  const earnedAchievements = rollPassAchievementIds.flatMap((achievementIds) => achievementIds);

  const result = db.transaction(() => {
    const newlyEarned = awardAchievements(db, userId, earnedAchievements);
    const levelAfter = level + levelIncrease;
    if (hasLevelUp) {
      setDiceLevel(db, { userId, level: levelAfter });
    }

    const totalReward = newlyEarned.length + levelIncrease * getDiceLevelUpReward();
    const fameAfter =
      totalReward > 0 ? applyFameDelta(db, { userId, amount: totalReward }) : fameBefore;

    recordDiceRollAnalytics(db, {
      userId,
      rollSetCount: rollPassCount,
      nearLevelupRollCount,
      diceRolledCount,
    });
    if (hasLevelUp) {
      resetDiceLevelAnalyticsProgress(db, userId);
    }

    if (!didChargePathWin && temporaryEffectsRollSummary.hasApplicableEffects) {
      consumeDiceTemporaryEffectsForRoll(db, {
        userId,
        commandName: "dice",
        rollsConsumed: 1,
        nowMs,
      });
    }
    setLastDiceRollAt(db, nowMs);

    return { newlyEarned, totalReward, levelAfter, fameAfter };
  })();

  const achievementText = formatAchievementText(result.newlyEarned);
  const rewardText = formatRewardText(result.totalReward, hasLevelUp);
  const unlockedBansAfter = getUnlockedBanSlotsFromFame(
    result.fameAfter,
    result.levelAfter,
    dieSides,
  );
  const unlockedFooter = unlockedBansAfter > unlockedBansBefore ? "New ban slot unlocked." : "";
  const doubleRollFooter =
    doubleRollUntil && doubleRollUntil > nowMs
      ? `Double buff remaining: ${formatRemainingTime(doubleRollUntil - nowMs)}.`
      : "";
  const prestigeFooter =
    result.levelAfter >= getDicePrestigeBaseLevel() && level < getDicePrestigeBaseLevel()
      ? "Prestige is now available. Use /dice-prestige to advance."
      : "";

  return {
    content: buildDiceRollReplyContent({
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
    }),
    ephemeral: false,
  };
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
