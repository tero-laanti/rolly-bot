import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import type { DicePrestigeResult } from "../../../application/manage-prestige/use-case";
import { encodeDicePrestigeAction } from "../buttons/prestige-buttons";
import { renderActionButtonRows } from "./render-button-rows";

export const renderDicePrestigeResult = (result: DicePrestigeResult): InteractionResult => {
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
        components: renderActionButtonRows(
          result.payload.view.components,
          encodeDicePrestigeAction,
        ),
        ephemeral: result.payload.ephemeral,
      },
    };
  }

  return {
    kind: "update",
    payload: {
      content: result.payload.view.content,
      components: renderActionButtonRows(
        result.payload.view.components,
        encodeDicePrestigeAction,
      ),
    },
  };
};
