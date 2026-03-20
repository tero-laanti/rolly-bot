import {
  chunkActionButtons,
  type ActionResult,
  type ActionView,
} from "../../../../shared-kernel/application/action-view";
import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceInventoryRepository, DiceShopCatalog } from "../ports";
import type { DiceShopItem } from "../../../inventory/domain/shop";
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import { awardManualDiceAchievements } from "../../../progression/application/achievement-awards";
import { appendAchievementUnlockText } from "../../../progression/application/achievement-text";
import { getDiceItemAchievementIds } from "../achievement-rules";
import { getItemOwnershipLabel, isPassivePermanentItem } from "../../domain/passive-items";

export type DiceShopAction =
  | {
      type: "buy";
      ownerId: string;
      itemId: string;
    }
  | {
      type: "refresh";
      ownerId: string;
    };

export type DiceShopResult = ActionResult<DiceShopAction>;

type ManageShopDependencies = {
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getEconomySnapshot" | "getPips">;
  inventory: Pick<
    DiceInventoryRepository,
    "getInventoryQuantities" | "grantInventoryItem" | "recordShopPurchase"
  >;
  progression: Pick<DiceProgressionRepository, "awardAchievements">;
  shopCatalog: DiceShopCatalog;
  unitOfWork: UnitOfWork;
};

export const createDiceShopUseCase = ({
  economy,
  inventory,
  progression,
  shopCatalog,
  unitOfWork,
}: ManageShopDependencies) => {
  const createDiceShopReply = (userId: string): DiceShopResult => {
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildShopView(economy, inventory, shopCatalog, userId),
        ephemeral: false,
      },
    };
  };

  const handleDiceShopAction = (actorId: string, action: DiceShopAction): DiceShopResult => {
    if (actorId !== action.ownerId) {
      return {
        kind: "reply",
        payload: {
          type: "message",
          content: "This shop menu is not assigned to you.",
          ephemeral: true,
        },
      };
    }

    if (action.type === "refresh") {
      return {
        kind: "update",
        payload: {
          type: "view",
          view: buildShopView(economy, inventory, shopCatalog, action.ownerId),
        },
      };
    }

    const item = shopCatalog.getDiceShopItem(action.itemId);
    if (!item) {
      return {
        kind: "reply",
        payload: {
          type: "message",
          content: "That shop item does not exist.",
          ephemeral: true,
        },
      };
    }

    const ownedQuantity = inventory.getInventoryQuantities(action.ownerId).get(item.id) ?? 0;
    if (isPassivePermanentItem(item) && ownedQuantity > 0) {
      return {
        kind: "reply",
        payload: {
          type: "message",
          content: `${item.name} is already owned. Permanent passive upgrades can only be bought once.`,
          ephemeral: true,
        },
      };
    }

    const currentPips = economy.getPips(action.ownerId);
    if (currentPips < item.pricePips) {
      return {
        kind: "reply",
        payload: {
          type: "message",
          content: `You need ${item.pricePips} pips to buy ${item.name}. Current balance: ${currentPips} pips.`,
          ephemeral: true,
        },
      };
    }

    const purchase = unitOfWork.runInTransaction(() => {
      economy.applyPipsDelta({ userId: action.ownerId, amount: -item.pricePips });
      const quantity = inventory.grantInventoryItem({
        userId: action.ownerId,
        itemId: item.id,
        quantity: 1,
      });
      const itemAchievementStats = inventory.recordShopPurchase(action.ownerId);
      const newlyEarned = awardManualDiceAchievements(
        progression,
        action.ownerId,
        getDiceItemAchievementIds(itemAchievementStats),
      );

      return {
        item,
        quantity,
        remainingPips: economy.getPips(action.ownerId),
        newlyEarned,
      };
    });

    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildShopView(
          economy,
          inventory,
          shopCatalog,
          action.ownerId,
          appendAchievementUnlockText(
            `Purchased ${purchase.item.name}. Remaining pips: ${purchase.remainingPips}. Owned: ${purchase.quantity}.`,
            purchase.newlyEarned,
          ),
        ),
      },
    };
  };

  return {
    createDiceShopReply,
    handleDiceShopAction,
  };
};

const buildShopView = (
  economy: Pick<DiceEconomyRepository, "getEconomySnapshot">,
  inventory: Pick<DiceInventoryRepository, "getInventoryQuantities">,
  shopCatalog: DiceShopCatalog,
  userId: string,
  statusLine?: string,
): ActionView<DiceShopAction> => {
  return {
    content: buildShopContent(economy, inventory, shopCatalog, userId, statusLine),
    components: buildShopComponents(shopCatalog, inventory, userId),
  };
};

const buildShopContent = (
  economy: Pick<DiceEconomyRepository, "getEconomySnapshot">,
  inventory: Pick<DiceInventoryRepository, "getInventoryQuantities">,
  shopCatalog: DiceShopCatalog,
  userId: string,
  statusLine?: string,
): string => {
  const economySnapshot = economy.getEconomySnapshot(userId);
  const inventoryQuantities = inventory.getInventoryQuantities(userId);
  const sections: string[] = [];

  if (statusLine) {
    sections.push(statusLine);
  }

  sections.push(
    [
      `Dice shop for <@${userId}>:`,
      `Pips: ${economySnapshot.pips}.`,
      "Spend pips on inventory items.",
    ].join("\n"),
  );

  sections.push(
    ...shopCatalog
      .getDiceShopItems()
      .map((item) => buildItemLines(item, inventoryQuantities.get(item.id) ?? 0).join("\n")),
  );

  return sections.join("\n\n");
};

const buildItemLines = (item: DiceShopItem, ownedQuantity: number): string[] => {
  return [
    `**${item.name}**`,
    `Cost: ${item.pricePips} pips.`,
    `Owned: ${ownedQuantity}.`,
    getItemOwnershipLabel(item),
    item.description,
  ];
};

const buildShopComponents = (
  shopCatalog: DiceShopCatalog,
  inventory: Pick<DiceInventoryRepository, "getInventoryQuantities">,
  userId: string,
): ActionView<DiceShopAction>["components"] => {
  const inventoryQuantities = inventory.getInventoryQuantities(userId);
  const purchaseButtons = shopCatalog.getDiceShopItems().map((item) => {
    const alreadyOwned =
      isPassivePermanentItem(item) && (inventoryQuantities.get(item.id) ?? 0) > 0;
    return {
      action: {
        type: "buy",
        ownerId: userId,
        itemId: item.id,
      } as const,
      label: alreadyOwned ? `${item.name} (Owned)` : `Buy ${item.name} (${item.pricePips})`,
      style: "success" as const,
      disabled: alreadyOwned,
    };
  });

  return [
    ...chunkActionButtons(purchaseButtons),
    [
      {
        action: { type: "refresh", ownerId: userId },
        label: "Refresh",
        style: "secondary",
      },
    ],
  ];
};
