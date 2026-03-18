import type { DiceShopAction } from "../../../application/manage-shop/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceShopButtonPrefix = "dice-shop:";

export const encodeDiceShopAction = (action: DiceShopAction): string => {
  if (action.type === "refresh") {
    return encodeActionId(diceShopButtonPrefix, "refresh", action.ownerId);
  }

  return encodeActionId(diceShopButtonPrefix, "buy", action.ownerId, action.itemId);
};

export const parseDiceShopAction = (customId: string): DiceShopAction | null => {
  const parsed = parseActionId(customId, diceShopButtonPrefix);
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

  if (action === "buy" && itemId) {
    return { type: "buy", ownerId, itemId };
  }

  return null;
};
