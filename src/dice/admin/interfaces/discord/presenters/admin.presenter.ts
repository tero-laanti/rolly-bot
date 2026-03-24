import type { RenderedInteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionResult } from "../../../../../app/discord/render-action-result";
import type { DiceAdminResult } from "../../../application/manage-admin/use-case";
import { encodeDiceAdminAction } from "../buttons/admin-buttons";

export const renderDiceAdminResult = (result: DiceAdminResult): RenderedInteractionResult => {
  return renderActionResult(result, encodeDiceAdminAction);
};
