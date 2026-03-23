import { userMention } from "discord.js";
import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionButtonRows } from "../../../../../app/discord/render-action-button-rows";
import type {
  DiceLeaderboardsResult,
  DiceLeaderboardsView,
} from "../../../application/query-leaderboards/use-case";
import { encodeDiceLeaderboardsAction } from "../buttons/leaderboards-buttons";

export const renderDiceLeaderboardsResult = (result: DiceLeaderboardsResult): InteractionResult => {
  const payload = renderDiceLeaderboardsView(result.payload.view);

  if (result.kind === "reply") {
    return {
      kind: "reply",
      payload: {
        ...payload,
        ephemeral: result.payload.ephemeral,
      },
    };
  }

  return {
    kind: "update",
    payload,
  };
};

const renderDiceLeaderboardsView = (view: DiceLeaderboardsView): InteractionResult["payload"] => {
  const lines =
    view.rows.length > 0
      ? view.rows.map((row) => `${row.rank}. ${userMention(row.userId)} - ${row.summary}`)
      : [view.emptyMessage];

  return {
    content: [view.title, "", ...lines].join("\n"),
    allowedMentions: {
      users: [],
    },
    components: renderActionButtonRows(view.components, encodeDiceLeaderboardsAction),
  };
};
