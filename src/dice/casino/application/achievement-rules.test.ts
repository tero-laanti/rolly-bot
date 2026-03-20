import assert from "node:assert/strict";
import test from "node:test";
import { getCasinoAchievementIds } from "./achievement-rules";

test("casino achievement rules award first wager and exact face milestones", () => {
  const achievementIds = getCasinoAchievementIds({
    roundsCompletedTotal: 1,
    totalWagered: 150,
    highestPayout: 60,
    exactFaceWins: 1,
    highLowWins: 0,
    pushCashouts: 0,
    pushPerfectRuns: 0,
    blackjackNaturals: 0,
    blackjackPushes: 0,
    blackjackHitTo21Wins: 0,
    pokerStraights: 0,
    pokerFullHouses: 0,
    pokerFourOfAKind: 0,
    pokerFiveOfAKind: 0,
    playedExactRoll: true,
    playedPushYourLuck: false,
    playedBlackjack: false,
    playedDicePoker: false,
  });

  assert.deepEqual(
    achievementIds.filter((achievementId) =>
      ["first-wager", "wagered-100", "payout-50", "exact-face-1"].includes(achievementId),
    ),
    ["first-wager", "wagered-100", "payout-50", "exact-face-1"],
  );
});
