import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import { renderActionButtonRows } from "../../../../../app/discord/render-action-button-rows";
import type { DiceInventoryResult } from "../../../application/manage-inventory/use-case";
import { encodeDiceInventoryAction } from "../buttons/inventory-buttons";

export const renderDiceInventoryResult = (result: DiceInventoryResult): InteractionResult => {
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
          encodeDiceInventoryAction,
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
        encodeDiceInventoryAction,
      ),
    },
  };
};
