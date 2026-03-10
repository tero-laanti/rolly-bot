import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceInventoryResult } from "../../../application/manage-inventory/use-case";
import { encodeDiceInventoryAction } from "../buttons/inventory-buttons";

export const renderDiceInventoryResult = (result: DiceInventoryResult): InteractionResult => {
  return renderActionResult(result, encodeDiceInventoryAction);
};
