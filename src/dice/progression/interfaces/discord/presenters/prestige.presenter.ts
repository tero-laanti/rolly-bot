import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DicePrestigeResult } from "../../../application/manage-prestige/use-case";
import { encodeDicePrestigeAction } from "../buttons/prestige-buttons";

export const renderDicePrestigeResult = (result: DicePrestigeResult): InteractionResult => {
  return renderActionResult(result, encodeDicePrestigeAction);
};
