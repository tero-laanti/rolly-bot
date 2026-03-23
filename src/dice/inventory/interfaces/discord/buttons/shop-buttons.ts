import type { DiceShopAction, DiceShopCategoryId } from "../../../application/manage-shop/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceShopButtonPrefix = "dice-shop:";

export const encodeDiceShopButtonAction = (
  action: Extract<DiceShopAction, { type: string }>,
): string => {
  switch (action.type) {
    case "view-home":
      return encodeActionId(diceShopButtonPrefix, "view-home", action.ownerId);
    case "open-category":
      return encodeActionId(
        diceShopButtonPrefix,
        "open-category",
        action.ownerId,
        action.categoryId,
      );
    case "buy-selected-item":
      return encodeActionId(
        diceShopButtonPrefix,
        "buy-selected-item",
        action.ownerId,
        action.categoryId,
        action.itemId,
      );
    case "close":
      return encodeActionId(diceShopButtonPrefix, "close", action.ownerId);
    case "select-item":
      throw new Error("Select-item actions must be encoded as string select menu ids.");
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
};

export const parseDiceShopButtonAction = (
  customId: string,
): Exclude<DiceShopAction, { type: "select-item" }> | null => {
  const parsed = parseActionId(customId, diceShopButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId, categoryId, itemId] = parsed;
  if (!ownerId) {
    return null;
  }

  if (action === "view-home") {
    return { type: "view-home", ownerId };
  }

  if (action === "close") {
    return { type: "close", ownerId };
  }

  if (action === "open-category" && isDiceShopCategoryId(categoryId)) {
    return { type: "open-category", ownerId, categoryId };
  }

  if (action === "buy-selected-item" && isDiceShopCategoryId(categoryId) && itemId) {
    return { type: "buy-selected-item", ownerId, categoryId, itemId };
  }

  return null;
};

const isDiceShopCategoryId = (value: string | undefined): value is DiceShopCategoryId => {
  return value === "consumables" || value === "permanent-upgrades";
};
