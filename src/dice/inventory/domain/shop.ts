import { getDiceItemsData } from "../../../rolly-data/load";
import type { DiceItemData } from "../../../rolly-data/types";

export type DiceShopItemId = string;
export type DiceShopItem = DiceItemData;

export type DiceShopPurchaseResult =
  | {
      ok: true;
      item: DiceShopItem;
      quantity: number;
      remainingPips: number;
    }
  | {
      ok: false;
      reason: "unknown-item";
    }
  | {
      ok: false;
      reason: "insufficient-pips";
      item: DiceShopItem;
      currentPips: number;
      requiredPips: number;
    };

export type DiceInventoryEntry = {
  item: DiceShopItem;
  quantity: number;
};

export type ConsumeInventoryItemResult =
  | {
      ok: true;
      item: DiceShopItem;
      remainingQuantity: number;
    }
  | {
      ok: false;
      reason: "unknown-item";
    }
  | {
      ok: false;
      reason: "not-owned";
      item: DiceShopItem;
    };

export const getDiceShopItems = (): DiceShopItem[] => {
  return getDiceItemsData();
};

export const getDiceShopItem = (itemId: string): DiceShopItem | null => {
  return getDiceShopItems().find((item) => item.id === itemId) ?? null;
};
