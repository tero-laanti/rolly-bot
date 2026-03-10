import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceShopResult } from "../../../application/manage-shop/use-case";
import { encodeDiceShopAction } from "../buttons/shop-buttons";

export const renderDiceShopResult = (result: DiceShopResult): InteractionResult => {
  return renderActionResult(result, encodeDiceShopAction);
};
