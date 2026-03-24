import type { RenderedInteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DicePrestigeResult } from "../../../application/manage-prestige/use-case";
import { encodeDicePrestigeAction } from "../buttons/prestige-buttons";

export const renderDicePrestigeResult = (result: DicePrestigeResult): RenderedInteractionResult => {
  return renderActionResult(result, encodeDicePrestigeAction);
};
