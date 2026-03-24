import type { RenderedInteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceBansResult } from "../../../application/manage-bans/use-case";
import { encodeDiceBansAction } from "../buttons/bans-buttons";

export const renderDiceBansResult = (result: DiceBansResult): RenderedInteractionResult => {
  return renderActionResult(result, encodeDiceBansAction);
};
