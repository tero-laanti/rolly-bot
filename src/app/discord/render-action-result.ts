import type { InteractionResult } from "./interaction-response";
import { renderActionButtonRows } from "./render-action-button-rows";
import type { ActionResult, ActionView } from "../../shared-kernel/application/action-view";

export const renderActionView = <TAction>(
  view: ActionView<TAction>,
  encodeAction: (action: TAction) => string,
): InteractionResult["payload"] => {
  return {
    content: view.content,
    components: renderActionButtonRows(view.components, encodeAction),
  };
};

export const renderActionResult = <TAction>(
  result: ActionResult<TAction>,
  encodeAction: (action: TAction) => string,
): InteractionResult => {
  if (result.payload.type === "message") {
    if (result.kind === "reply") {
      return {
        kind: "reply",
        payload: {
          content: result.payload.content,
          ephemeral: result.payload.ephemeral,
        },
      };
    }

    return {
      kind: result.kind,
      payload: {
        content: result.payload.content,
        components: result.payload.clearComponents ? [] : undefined,
      },
    };
  }

  if (result.kind === "reply") {
    return {
      kind: "reply",
      payload: {
        ...renderActionView(result.payload.view, encodeAction),
        ephemeral: result.payload.ephemeral,
      },
    };
  }

  return {
    kind: result.kind,
    payload: renderActionView(result.payload.view, encodeAction),
  };
};
