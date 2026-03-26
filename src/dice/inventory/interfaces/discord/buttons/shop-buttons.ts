import type {
  DiceShopAction,
  DiceShopCategoryId,
  DiceShopItemNavigationDirection,
} from "../../../application/manage-shop/use-case";
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
    case "page-category":
      return encodeActionId(
        diceShopButtonPrefix,
        "page-category",
        action.ownerId,
        action.categoryId,
        action.page,
      );
    case "prompt-use-item":
      return encodeActionId(
        diceShopButtonPrefix,
        "prompt-use-item",
        action.ownerId,
        action.categoryId,
        action.itemId,
      );
    case "confirm-use-item":
      return encodeActionId(
        diceShopButtonPrefix,
        "confirm-use-item",
        action.ownerId,
        action.categoryId,
        action.itemId,
      );
    case "buy-selected-item":
      return encodeActionId(
        diceShopButtonPrefix,
        "buy-selected-item",
        action.ownerId,
        action.categoryId,
        action.itemId,
      );
    case "view-adjacent-item":
      return encodeActionId(
        diceShopButtonPrefix,
        "view-adjacent-item",
        action.ownerId,
        action.categoryId,
        action.itemId,
        action.direction,
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

  const [action, ownerId, categoryId, itemIdOrPage, direction] = parsed;
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

  if (action === "page-category" && isDiceShopCategoryId(categoryId)) {
    const page = Number.parseInt(itemIdOrPage ?? "", 10);
    if (!Number.isInteger(page)) {
      return null;
    }

    return { type: "page-category", ownerId, categoryId, page };
  }

  if (action === "prompt-use-item" && isDiceShopCategoryId(categoryId) && itemIdOrPage) {
    return { type: "prompt-use-item", ownerId, categoryId, itemId: itemIdOrPage };
  }

  if (action === "confirm-use-item" && isDiceShopCategoryId(categoryId) && itemIdOrPage) {
    return { type: "confirm-use-item", ownerId, categoryId, itemId: itemIdOrPage };
  }

  if (action === "buy-selected-item" && isDiceShopCategoryId(categoryId) && itemIdOrPage) {
    return { type: "buy-selected-item", ownerId, categoryId, itemId: itemIdOrPage };
  }

  if (
    action === "view-adjacent-item" &&
    isDiceShopCategoryId(categoryId) &&
    itemIdOrPage &&
    isDiceShopItemNavigationDirection(direction)
  ) {
    return { type: "view-adjacent-item", ownerId, categoryId, itemId: itemIdOrPage, direction };
  }

  return null;
};

const isDiceShopCategoryId = (value: string | undefined): value is DiceShopCategoryId => {
  return value === "consumables" || value === "permanent-upgrades";
};

const isDiceShopItemNavigationDirection = (
  value: string | undefined,
): value is DiceShopItemNavigationDirection => {
  return value === "previous" || value === "next";
};
