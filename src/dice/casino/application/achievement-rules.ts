import type { DiceCasinoAchievementStats } from "./ports";

export const getCasinoAchievementIds = (stats: DiceCasinoAchievementStats): string[] => {
  const achievementIds: string[] = [];

  if (stats.roundsCompletedTotal >= 1) {
    achievementIds.push("first-wager");
  }
  if (stats.roundsCompletedTotal >= 100) {
    achievementIds.push("regular-customer");
  }
  if (stats.roundsCompletedTotal >= 1000) {
    achievementIds.push("casino-addict");
  }

  if (stats.totalWagered >= 100) {
    achievementIds.push("wagered-100");
  }
  if (stats.totalWagered >= 1000) {
    achievementIds.push("wagered-1000");
  }
  if (stats.totalWagered >= 10000) {
    achievementIds.push("wagered-10000");
  }

  if (stats.highestPayout >= 50) {
    achievementIds.push("payout-50");
  }
  if (stats.highestPayout >= 250) {
    achievementIds.push("payout-250");
  }
  if (stats.highestPayout >= 1000) {
    achievementIds.push("jackpot");
  }

  if (stats.exactFaceWins >= 1) {
    achievementIds.push("exact-face-1");
  }
  if (stats.exactFaceWins >= 25) {
    achievementIds.push("exact-face-25");
  }
  if (stats.highLowWins >= 1) {
    achievementIds.push("high-low-1");
  }
  if (stats.highLowWins >= 100) {
    achievementIds.push("high-low-100");
  }

  if (stats.pushCashouts >= 1) {
    achievementIds.push("push-cashout-1");
  }
  if (stats.pushPerfectRuns >= 1) {
    achievementIds.push("push-perfect-run-1");
  }

  if (stats.blackjackNaturals >= 1) {
    achievementIds.push("blackjack-natural-1");
  }
  if (stats.blackjackPushes >= 1) {
    achievementIds.push("blackjack-push-1");
  }
  if (stats.blackjackHitTo21Wins >= 1) {
    achievementIds.push("blackjack-hit-to-21-win-1");
  }

  if (stats.pokerStraights >= 1) {
    achievementIds.push("poker-straight-1");
  }
  if (stats.pokerFullHouses >= 1) {
    achievementIds.push("poker-full-house-1");
  }
  if (stats.pokerFourOfAKind >= 1) {
    achievementIds.push("poker-four-of-a-kind-1");
  }
  if (stats.pokerFiveOfAKind >= 1) {
    achievementIds.push("poker-five-of-a-kind-1");
  }

  if (
    stats.playedExactRoll &&
    stats.playedPushYourLuck &&
    stats.playedBlackjack &&
    stats.playedDicePoker
  ) {
    achievementIds.push("casino-all-games-played");
  }

  return achievementIds;
};
