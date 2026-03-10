import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionButtonRows } from "../../../../../app/discord/render-action-button-rows";
import type { DiceShopResult } from "../../../application/manage-shop/use-case";
import { encodeDiceShopAction } from "../buttons/shop-buttons";

export const renderDiceShopResult = (result: DiceShopResult): InteractionResult => {
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
        components: renderActionButtonRows(result.payload.view.components, encodeDiceShopAction),
        ephemeral: result.payload.ephemeral,
      },
    };
  }

  return {
    kind: "update",
    payload: {
      content: result.payload.view.content,
      components: renderActionButtonRows(result.payload.view.components, encodeDiceShopAction),
    },
  };
};
