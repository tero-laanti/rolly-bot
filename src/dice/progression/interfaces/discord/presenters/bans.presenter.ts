import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import type { DiceBansResult } from "../../../application/manage-bans/use-case";
import { encodeDiceBansAction } from "../buttons/bans-buttons";
import { renderActionButtonRows } from "./render-button-rows";

export const renderDiceBansResult = (result: DiceBansResult): InteractionResult => {
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
      kind: "update",
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
        content: result.payload.view.content,
        components: renderActionButtonRows(result.payload.view.components, encodeDiceBansAction),
        ephemeral: result.payload.ephemeral,
      },
    };
  }

  return {
    kind: "update",
    payload: {
      content: result.payload.view.content,
      components: renderActionButtonRows(result.payload.view.components, encodeDiceBansAction),
    },
  };
};
