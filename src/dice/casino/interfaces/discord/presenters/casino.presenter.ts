import type { RenderedInteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceCasinoResult } from "../../../application/manage-casino/use-case";
import { encodeDiceCasinoAction } from "../buttons/casino-buttons";

export const renderDiceCasinoResult = (result: DiceCasinoResult): RenderedInteractionResult => {
  return renderActionResult(result, encodeDiceCasinoAction);
};
