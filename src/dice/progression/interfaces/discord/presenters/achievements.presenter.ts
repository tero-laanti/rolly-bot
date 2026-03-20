import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceAchievementsResult } from "../../../application/query-achievements/use-case";
import { encodeDiceAchievementsAction } from "../buttons/achievements-buttons";

export const renderDiceAchievementsResult = (result: DiceAchievementsResult): InteractionResult => {
  return renderActionResult(result, encodeDiceAchievementsAction);
};
