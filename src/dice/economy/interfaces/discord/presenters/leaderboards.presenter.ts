import { escapeMarkdown } from "discord.js";
import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionButtonRows } from "../../../../../app/discord/render-action-button-rows";
import type { UserDisplayNameResolver } from "../../../../../app/discord/resolve-user-display-name";
import type {
  DiceLeaderboardsResult,
  DiceLeaderboardsView,
} from "../../../application/query-leaderboards/use-case";
import { encodeDiceLeaderboardsAction } from "../buttons/leaderboards-buttons";

export const renderDiceLeaderboardsResult = async (
  result: DiceLeaderboardsResult,
  resolveDisplayName: UserDisplayNameResolver,
): Promise<InteractionResult> => {
  const payload = await renderDiceLeaderboardsView(result.payload.view, resolveDisplayName);

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

const renderDiceLeaderboardsView = async (
  view: DiceLeaderboardsView,
  resolveDisplayName: UserDisplayNameResolver,
): Promise<InteractionResult["payload"]> => {
  const lines =
    view.rows.length > 0
      ? await Promise.all(
          view.rows.map(async (row) => {
            const displayName = formatDisplayName(await resolveDisplayName(row.userId));
            return `${row.rank}. ${displayName} - ${row.summary}`;
          }),
        )
      : [view.emptyMessage];

  return {
    content: [view.title, "", ...lines].join("\n"),
    components: renderActionButtonRows(view.components, encodeDiceLeaderboardsAction),
  };
};

const formatDisplayName = (displayName: string): string => {
  return escapeMarkdown(displayName).replace(/@/g, "@\u200b");
};
