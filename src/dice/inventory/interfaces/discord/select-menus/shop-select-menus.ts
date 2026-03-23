import type { DiceShopAction, DiceShopCategoryId } from "../../../application/manage-shop/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceShopSelectMenuPrefix = "dice-shop-select:";

export const encodeDiceShopSelectMenuId = (
  action: Pick<Extract<DiceShopAction, { type: "select-item" }>, "type" | "ownerId" | "categoryId">,
): string => {
  return encodeActionId(diceShopSelectMenuPrefix, "select-item", action.ownerId, action.categoryId);
};

export const parseDiceShopSelectMenuAction = (
  customId: string,
  values: readonly string[],
): Extract<DiceShopAction, { type: "select-item" }> | null => {
  const parsed = parseActionId(customId, diceShopSelectMenuPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId, categoryId] = parsed;
  const [itemId] = values;
  if (action !== "select-item" || !ownerId || !isDiceShopCategoryId(categoryId) || !itemId) {
    return null;
  }

  return {
    type: "select-item",
    ownerId,
    categoryId,
    itemId,
  };
};

const isDiceShopCategoryId = (value: string | undefined): value is DiceShopCategoryId => {
  return value === "consumables" || value === "permanent-upgrades";
};
