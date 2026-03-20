import type { DiceAnalytics } from "../../analytics/domain/analytics";
import type { DicePvpAchievementStats } from "./ports";

export const getDicePvpAchievementIds = (
  analytics: Pick<DiceAnalytics, "pvpWins" | "pvpLosses" | "pvpDraws">,
  stats: DicePvpAchievementStats,
): string[] => {
  const achievementIds: string[] = [];

  if (analytics.pvpWins >= 1) {
    achievementIds.push("pvp-first-win");
  }
  if (analytics.pvpLosses >= 1) {
    achievementIds.push("pvp-first-loss");
  }
  if (analytics.pvpDraws >= 1) {
    achievementIds.push("pvp-first-draw");
  }

  if (stats.duelsTotal >= 10) {
    achievementIds.push("pvp-duels-10");
  }
  if (stats.duelsTotal >= 100) {
    achievementIds.push("pvp-duels-100");
  }

  if (analytics.pvpWins >= 10) {
    achievementIds.push("pvp-wins-10");
  }
  if (analytics.pvpWins >= 100) {
    achievementIds.push("pvp-wins-100");
  }
  if (analytics.pvpWins >= 1000) {
    achievementIds.push("pvp-wins-1000");
  }

  if (stats.highestWinStreak >= 3) {
    achievementIds.push("pvp-win-streak-3");
  }
  if (stats.highestWinStreak >= 10) {
    achievementIds.push("pvp-win-streak-10");
  }

  if (stats.highestTierWin >= 5) {
    achievementIds.push("pvp-highest-tier-win");
  }

  return achievementIds;
};
