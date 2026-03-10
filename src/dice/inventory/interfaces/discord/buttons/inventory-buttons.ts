import type { DiceInventoryAction } from "../../../application/manage-inventory/use-case";

export const diceInventoryButtonPrefix = "dice-inventory:";

export const encodeDiceInventoryAction = (action: DiceInventoryAction): string => {
  if (action.type === "refresh") {
    return `${diceInventoryButtonPrefix}refresh:${action.ownerId}`;
  }

  return `${diceInventoryButtonPrefix}use:${action.ownerId}:${action.itemId}`;
};

export const parseDiceInventoryAction = (customId: string): DiceInventoryAction | null => {
  const [prefix, action, ownerId, itemId] = customId.split(":");
  if (prefix !== diceInventoryButtonPrefix.slice(0, -1) || !ownerId) {
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
