import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import {
  renderActionResult,
  renderActionView,
} from "../../../../../app/discord/render-action-result";
import type { DicePvpResult, DicePvpAction } from "../../../application/manage-challenge/use-case";
import { encodeDicePvpAction } from "../buttons/pvp-buttons";
import type { ActionView } from "../../../../../shared-kernel/application/action-view";

export const renderDicePvpResult = (result: DicePvpResult): InteractionResult => {
  return renderActionResult(result, encodeDicePvpAction);
};

export const renderDicePvpView = (
  view: ActionView<DicePvpAction>,
): InteractionResult["payload"] => {
  return renderActionView(view, encodeDicePvpAction);
};
