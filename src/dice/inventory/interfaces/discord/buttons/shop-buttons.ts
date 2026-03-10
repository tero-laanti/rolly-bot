import type { DiceShopAction } from "../../../application/manage-shop/use-case";

export const diceShopButtonPrefix = "dice-shop:";

export const encodeDiceShopAction = (action: DiceShopAction): string => {
  if (action.type === "refresh") {
    return `${diceShopButtonPrefix}refresh:${action.ownerId}`;
  }

  return `${diceShopButtonPrefix}buy:${action.ownerId}:${action.itemId}`;
};

export const parseDiceShopAction = (customId: string): DiceShopAction | null => {
  const [prefix, action, ownerId, itemId] = customId.split(":");
  if (prefix !== diceShopButtonPrefix.slice(0, -1) || !ownerId) {
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
