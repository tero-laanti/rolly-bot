import type { DiceInventoryAction } from "../../../application/manage-inventory/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceInventoryButtonPrefix = "dice-inventory:";

export const encodeDiceInventoryAction = (action: DiceInventoryAction): string => {
  if (action.type === "refresh") {
    return encodeActionId(diceInventoryButtonPrefix, "refresh", action.ownerId, action.page);
  }

  if (action.type === "page") {
    return encodeActionId(diceInventoryButtonPrefix, "page", action.ownerId, action.page);
  }

  return encodeActionId(
    diceInventoryButtonPrefix,
    "use",
    action.ownerId,
    action.itemId,
    action.page,
  );
};

export const parseDiceInventoryAction = (customId: string): DiceInventoryAction | null => {
  const parsed = parseActionId(customId, diceInventoryButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId, itemIdOrPage, pageRaw] = parsed;
  if (!ownerId) {
    return null;
  }

  if (action === "refresh") {
    const page = Number.parseInt(itemIdOrPage ?? "0", 10);
    return {
      type: "refresh",
      ownerId,
      page: Number.isInteger(page) ? page : 0,
    };
  }

  if (action === "page") {
    const page = Number.parseInt(itemIdOrPage ?? "", 10);
    if (!Number.isInteger(page)) {
      return null;
    }

    return { type: "page", ownerId, page };
  }

  const page = Number.parseInt(pageRaw ?? "0", 10);
  if (action === "use" && itemIdOrPage) {
    return {
      type: "use",
      ownerId,
      itemId: itemIdOrPage,
      page: Number.isInteger(page) ? page : 0,
    };
  }

  return null;
};
