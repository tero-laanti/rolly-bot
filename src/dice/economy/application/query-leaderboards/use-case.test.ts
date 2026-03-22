import assert from "node:assert/strict";
import test from "node:test";
import { createQueryDiceLeaderboardsUseCase } from "./use-case";

test("leaderboards default to top pips and disable the active toggle", () => {
  const useCase = createQueryDiceLeaderboardsUseCase({
    economy: {
      getTopBalanceEntries: ({ metric }) =>
        metric === "pips"
          ? [
              { userId: "user-2", fame: 40, pips: 15 },
              { userId: "user-1", fame: 12, pips: 10 },
            ]
          : [{ userId: "user-3", fame: 50, pips: 4 }],
    },
    progression: {
      getTopPrestigeEntries: () => [],
    },
  });

  const result = useCase.createDiceLeaderboardsReply();

  assert.equal(result.kind, "reply");
  assert.equal(result.payload.type, "view");
  assert.equal(result.payload.view.title.includes("Top 10 Pips"), true);
  assert.deepEqual(result.payload.view.rows, [
    {
      rank: 1,
      userId: "user-2",
      summary: "15 Pips | 40 Fame",
    },
    {
      rank: 2,
      userId: "user-1",
      summary: "10 Pips | 12 Fame",
    },
  ]);
  assert.equal(result.payload.view.components[0]?.[0]?.disabled, true);
  assert.equal(result.payload.view.components[0]?.[1]?.disabled, false);
  assert.equal(result.payload.view.components[0]?.[2]?.disabled, false);
});

test("leaderboards switch to fame ordering when the fame toggle is pressed", () => {
  const useCase = createQueryDiceLeaderboardsUseCase({
    economy: {
      getTopBalanceEntries: ({ metric }) =>
        metric === "fame"
          ? [
              { userId: "user-3", fame: 50, pips: 4 },
              { userId: "user-2", fame: 40, pips: 15 },
            ]
          : [{ userId: "user-1", fame: 12, pips: 10 }],
    },
    progression: {
      getTopPrestigeEntries: () => [],
    },
  });

  const result = useCase.handleDiceLeaderboardsAction({
    type: "metric",
    metric: "fame",
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  assert.equal(result.payload.view.title.includes("Top 10 Fame"), true);
  assert.deepEqual(result.payload.view.rows, [
    {
      rank: 1,
      userId: "user-3",
      summary: "50 Fame | 4 Pips",
    },
    {
      rank: 2,
      userId: "user-2",
      summary: "40 Fame | 15 Pips",
    },
  ]);
  assert.equal(result.payload.view.components[0]?.[0]?.disabled, false);
  assert.equal(result.payload.view.components[0]?.[1]?.disabled, true);
  assert.equal(result.payload.view.components[0]?.[2]?.disabled, false);
});

test("leaderboards switch to prestige ordering when the prestige toggle is pressed", () => {
  const useCase = createQueryDiceLeaderboardsUseCase({
    economy: {
      getTopBalanceEntries: () => [],
    },
    progression: {
      getTopPrestigeEntries: () => [
        { userId: "user-9", prestige: 4, level: 2 },
        { userId: "user-3", prestige: 3, level: 6 },
      ],
    },
  });

  const result = useCase.handleDiceLeaderboardsAction({
    type: "metric",
    metric: "prestige",
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  assert.equal(result.payload.view.title.includes("Top 10 Prestige"), true);
  assert.deepEqual(result.payload.view.rows, [
    {
      rank: 1,
      userId: "user-9",
      summary: "Prestige 4 | Level 2",
    },
    {
      rank: 2,
      userId: "user-3",
      summary: "Prestige 3 | Level 6",
    },
  ]);
  assert.equal(result.payload.view.components[0]?.[0]?.disabled, false);
  assert.equal(result.payload.view.components[0]?.[1]?.disabled, false);
  assert.equal(result.payload.view.components[0]?.[2]?.disabled, true);
});

test("leaderboards expose an empty state separately from rows", () => {
  const useCase = createQueryDiceLeaderboardsUseCase({
    economy: {
      getTopBalanceEntries: () => [],
    },
    progression: {
      getTopPrestigeEntries: () => [],
    },
  });

  const result = useCase.createDiceLeaderboardsReply();

  assert.equal(result.payload.view.rows.length, 0);
  assert.equal(result.payload.view.emptyMessage, "No players are on the leaderboard yet.");
});
