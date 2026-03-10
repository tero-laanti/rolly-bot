import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceBansResult } from "../../../application/manage-bans/use-case";
import { encodeDiceBansAction } from "../buttons/bans-buttons";

export const renderDiceBansResult = (result: DiceBansResult): InteractionResult => {
  return renderActionResult(result, encodeDiceBansAction);
};
