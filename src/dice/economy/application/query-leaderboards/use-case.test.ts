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
  assert.equal(result.payload.view.content.includes("Top 10 Pips"), true);
  assert.equal(result.payload.view.content.includes("1. <@user-2> - 15 Pips | 40 Fame"), true);
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
  assert.equal(result.payload.view.content.includes("Top 10 Fame"), true);
  assert.equal(result.payload.view.content.includes("1. <@user-3> - 50 Fame | 4 Pips"), true);
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
  assert.equal(result.payload.view.content.includes("Top 10 Prestige"), true);
  assert.equal(result.payload.view.content.includes("1. <@user-9> - Prestige 4 | Level 2"), true);
  assert.equal(result.payload.view.components[0]?.[0]?.disabled, false);
  assert.equal(result.payload.view.components[0]?.[1]?.disabled, false);
  assert.equal(result.payload.view.components[0]?.[2]?.disabled, true);
});
