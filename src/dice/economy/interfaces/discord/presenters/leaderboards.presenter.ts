import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceLeaderboardsResult } from "../../../application/query-leaderboards/use-case";
import { encodeDiceLeaderboardsAction } from "../buttons/leaderboards-buttons";

export const renderDiceLeaderboardsResult = (result: DiceLeaderboardsResult): InteractionResult => {
  return renderActionResult(result, encodeDiceLeaderboardsAction);
};
