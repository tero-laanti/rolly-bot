import assert from "node:assert/strict";
import test from "node:test";
import { renderDiceLeaderboardsResult } from "./leaderboards.presenter";
import type { DiceLeaderboardsResult } from "../../../application/query-leaderboards/use-case";

test("leaderboards presenter renders user mentions and suppresses pings", () => {
  const result: DiceLeaderboardsResult = {
    kind: "reply",
    payload: {
      type: "view",
      ephemeral: false,
      view: {
        title: "**Rolly Leaderboards: Top 10 Pips**",
        rows: [
          {
            rank: 1,
            userId: "123",
            summary: "15 Pips | 40 Fame",
          },
        ],
        emptyMessage: "No players are on the leaderboard yet.",
        components: [
          [
            {
              action: { type: "metric", metric: "pips" },
              label: "Top Pips",
              style: "primary",
              disabled: true,
            },
          ],
        ],
      },
    },
  };

  const rendered = renderDiceLeaderboardsResult(result);

  assert.equal(rendered.kind, "reply");
  assert.equal(
    rendered.payload.content,
    "**Rolly Leaderboards: Top 10 Pips**\n\n1. <@123> - 15 Pips | 40 Fame",
  );
  assert.deepEqual(rendered.payload.allowedMentions, {
    users: [],
  });
  assert.equal(rendered.payload.components?.length, 1);
});
