import type { DiceInventoryAction } from "../../../application/manage-inventory/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceInventoryButtonPrefix = "dice-inventory:";

export const encodeDiceInventoryAction = (action: DiceInventoryAction): string => {
  if (action.type === "refresh") {
    return encodeActionId(diceInventoryButtonPrefix, "refresh", action.ownerId);
  }

  return encodeActionId(diceInventoryButtonPrefix, "use", action.ownerId, action.itemId);
};

export const parseDiceInventoryAction = (customId: string): DiceInventoryAction | null => {
  const parsed = parseActionId(customId, diceInventoryButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId, itemId] = parsed;
  if (!ownerId) {
    return null;
  }

  if (action === "refresh") {
    return { type: "refresh", ownerId };
  }

  if (action === "use" && itemId) {
    return { type: "use", ownerId, itemId };
  }

  return null;
};
