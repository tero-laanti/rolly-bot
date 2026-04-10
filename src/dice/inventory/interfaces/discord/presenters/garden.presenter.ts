import type { RenderedInteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceGardenResult } from "../../../application/manage-garden/use-case";
import { encodeDiceGardenAction } from "../buttons/garden-buttons";

export const renderDiceGardenResult = (result: DiceGardenResult): RenderedInteractionResult => {
  return renderActionResult(result, encodeDiceGardenAction);
};
