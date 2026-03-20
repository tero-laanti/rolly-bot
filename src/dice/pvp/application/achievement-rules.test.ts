import assert from "node:assert/strict";
import test from "node:test";
import { getDicePvpAchievementIds } from "./achievement-rules";

test("pvp achievement rules award first win and streak thresholds", () => {
  const achievementIds = getDicePvpAchievementIds(
    {
      pvpWins: 10,
      pvpLosses: 1,
      pvpDraws: 1,
    },
    {
      duelsTotal: 12,
      currentWinStreak: 3,
      highestWinStreak: 3,
      highestTierWin: 5,
    },
  );

  assert.deepEqual(
    achievementIds.filter((achievementId) =>
      [
        "pvp-first-win",
        "pvp-first-loss",
        "pvp-first-draw",
        "pvp-duels-10",
        "pvp-wins-10",
        "pvp-win-streak-3",
        "pvp-highest-tier-win",
      ].includes(achievementId),
    ),
    [
      "pvp-first-win",
      "pvp-first-loss",
      "pvp-first-draw",
      "pvp-duels-10",
      "pvp-wins-10",
      "pvp-win-streak-3",
      "pvp-highest-tier-win",
    ],
  );
});
