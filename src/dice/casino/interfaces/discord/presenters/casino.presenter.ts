import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceCasinoResult } from "../../../application/manage-casino/use-case";
import { encodeDiceCasinoAction } from "../buttons/casino-buttons";

export const renderDiceCasinoResult = (result: DiceCasinoResult): InteractionResult => {
  return renderActionResult(result, encodeDiceCasinoAction);
};
