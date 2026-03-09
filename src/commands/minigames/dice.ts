import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../lib/db";
import { applyFameDelta, getFame } from "../../lib/economy";
import {
  awardAchievements,
  getActiveDiceLockout,
  getActiveDoubleRoll,
  getBaseRollPassCount,
  getDiceAchievementsForRoll,
  getDiceBans,
  getDiceChargeMultiplier,
  getDiceLevel,
  getDiceLevelUpReward,
  getDiceMaxRollPassCount,
  getDicePrestigeBaseLevel,
  getDicePrestige,
  getDiceSides,
  getDoubleBuffRollPassCount,
  getLastDiceRollAt,
  getUnlockedBanSlotsFromFame,
  getUserDiceAchievements,
  recordDiceRollAnalytics,
  resetDiceLevelAnalyticsProgress,
  rollDieWithBans,
  setDiceLevel,
  setLastDiceRollAt,
} from "../../lib/minigames/dice-game";
import {
  consumeDiceTemporaryEffectsForRoll,
  getRollPassMultiplierFromTemporaryEffects,
} from "../../lib/minigames/dice-temporary-effects";
import {
  buildDiceRollReplyContent,
  formatAchievementText,
  formatRewardText,
} from "../../lib/minigames/dice-roll-output";

const spamWindowMs = 2_000;
const diceSpamTracker = new Map<string, number>();

export const data = new SlashCommandBuilder().setName("dice").setDescription("Roll your dice.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const db = getDatabase();
  const userId = interaction.user.id;
  const now = Date.now();
  const lockoutUntil = getActiveDiceLockout(db, userId, now);
  if (lockoutUntil) {
    await interaction.reply({
      content: `${interaction.user}, you can play again ${formatRelativeTime(lockoutUntil)}.`,
      ephemeral: false,
    });
    return;
  }

  const lastSpamRollAt = diceSpamTracker.get(userId);
  diceSpamTracker.set(userId, now);
  if (lastSpamRollAt !== undefined && now - lastSpamRollAt <= spamWindowMs) {
    await interaction.reply({
      content: `${interaction.user} stop spamming!`,
      ephemeral: false,
    });
    return;
  }

  const level = getDiceLevel(db, userId);
  const highestPrestige = getDicePrestige(db, userId);
  const baseDiceCount = Math.max(1, level);
  const doubleRollUntil = getActiveDoubleRoll(db, userId, now);
  const lastDiceRollAt = getLastDiceRollAt(db);
  const chargeMultiplier = getDiceChargeMultiplier(lastDiceRollAt, now);
  const baseRollPassCount = getBaseRollPassCount(highestPrestige);
  const doubleBuffRollPassCount = doubleRollUntil
    ? getDoubleBuffRollPassCount(highestPrestige)
    : baseRollPassCount;
  const temporaryEffectsRollSummary = getRollPassMultiplierFromTemporaryEffects(db, userId, now);
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

  const rollPassAchievementIds = rollPasses.map((rolls) => getDiceAchievementsForRoll(rolls, now));
  const previouslyEarnedAchievementIds = new Set(getUserDiceAchievements(db, userId));
  const allSameCount = rollPasses.filter((rolls) =>
    rolls.every((roll) => roll === rolls[0]),
  ).length;
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
        nowMs: now,
      });
    }
    setLastDiceRollAt(db, now);

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
    doubleRollUntil && doubleRollUntil > now
      ? `Double buff remaining: ${formatRemainingTime(doubleRollUntil - now)}.`
      : "";
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

  await interaction.reply({
    content,
    ephemeral: false,
  });
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
  const suffix = value === 1 ? "" : "s";
  return `${value} ${unit}${suffix}`;
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
