import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceInventoryRepository, DiceShopCatalog } from "../ports";
import type { AutoRollSessionReservation } from "../ports";
import type { DiceShopItem } from "../../../inventory/domain/shop";
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import { awardManualDiceAchievements } from "../../../progression/application/achievement-awards";
import {
  createAchievementAnnouncement,
  type AchievementAnnouncement,
} from "../../../progression/application/achievement-announcements";
import { getDiceItemAchievementIds } from "../achievement-rules";
import { isPassivePermanentItem } from "../../domain/passive-items";
import {
  discordEmbedFieldValueCharacterLimit,
  discordStringSelectOptionLimit,
} from "../../../../shared/discord";
import type {
  ReserveAutoRollSession,
  TriggerRandomGroupEvent,
  UseDiceItemResult,
} from "../use-item/use-case";

export type DiceShopCategoryId = "consumables" | "permanent-upgrades";
export type DiceShopItemNavigationDirection = "previous" | "next";

type DiceShopCategoryDefinition = {
  id: DiceShopCategoryId;
  label: string;
  singularLabel: string;
  summary: string;
};

const diceShopCategories: DiceShopCategoryDefinition[] = [
  {
    id: "consumables",
    label: "Consumables",
    singularLabel: "Consumable",
    summary: "Single-use items and timed boosts for your next moves.",
  },
  {
    id: "permanent-upgrades",
    label: "Permanent Upgrades",
    singularLabel: "Permanent Upgrade",
    summary: "One-time passive upgrades that stay active once owned.",
  },
];

export type DiceShopAction =
  | {
      type: "view-home";
      ownerId: string;
    }
  | {
      type: "open-category";
      ownerId: string;
      categoryId: DiceShopCategoryId;
    }
  | {
      type: "page-category";
      ownerId: string;
      categoryId: DiceShopCategoryId;
      page: number;
    }
  | {
      type: "select-item";
      ownerId: string;
      categoryId: DiceShopCategoryId;
      itemId: string;
    }
  | {
      type: "prompt-use-item";
      ownerId: string;
      categoryId: DiceShopCategoryId;
      itemId: string;
    }
  | {
      type: "confirm-use-item";
      ownerId: string;
      categoryId: DiceShopCategoryId;
      itemId: string;
    }
  | {
      type: "buy-selected-item";
      ownerId: string;
      categoryId: DiceShopCategoryId;
      itemId: string;
    }
  | {
      type: "view-adjacent-item";
      ownerId: string;
      categoryId: DiceShopCategoryId;
      itemId: string;
      direction: DiceShopItemNavigationDirection;
    }
  | {
      type: "close";
      ownerId: string;
    };

export type DiceShopCategorySummary = {
  id: DiceShopCategoryId;
  label: string;
  summary: string;
  itemCount: number;
};

export type DiceShopCategoryItemSummary = {
  id: string;
  name: string;
  pricePips: number;
  ownedQuantity: number;
  ownedSummary: string;
};

export type DiceShopItemDetail = {
  id: string;
  name: string;
  description: string;
  pricePips: number;
  ownedQuantity: number;
  typeLabel: string;
  buyable: boolean;
  buyDisabledReason?: string;
};

export type DiceShopItemNavigation = {
  previousItemId: string | null;
  nextItemId: string | null;
};

export type DiceShopPurchaseReceipt = {
  itemId: string;
  categoryId: DiceShopCategoryId;
  itemName: string;
  ownedQuantity: number;
  remainingPips: number;
  changeSummary: string;
  canUseItemNow: boolean;
};

type DiceShopViewBase = {
  ownerId: string;
  balancePips: number;
  categorySummaries: DiceShopCategorySummary[];
  statusMessage?: string;
};

export type DiceShopViewModel =
  | (DiceShopViewBase & {
      screen: "landing";
    })
  | (DiceShopViewBase & {
      screen: "category";
      categoryId: DiceShopCategoryId;
      categoryLabel: string;
      categorySummary: string;
      currentPage: number;
      totalPages: number;
      categoryItems: DiceShopCategoryItemSummary[];
    })
  | (DiceShopViewBase & {
      screen: "item-detail";
      categoryId: DiceShopCategoryId;
      categoryLabel: string;
      categoryPage: number;
      categoryTotalPages: number;
      selectedItem: DiceShopItemDetail;
      itemNavigation: DiceShopItemNavigation;
    })
  | (DiceShopViewBase & {
      screen: "purchase-receipt";
      receipt: DiceShopPurchaseReceipt;
    })
  | (DiceShopViewBase & {
      screen: "use-item-confirmation";
      categoryId: DiceShopCategoryId;
      itemId: string;
      itemName: string;
    });

export type DiceShopActionOutcome = {
  result: DiceShopResult;
  autoRollStart?:
    | {
        reservation: AutoRollSessionReservation;
        itemId: string;
      }
    | undefined;
};

export type DiceShopResult =
  | {
      kind: "reply";
      achievementAnnouncements?: AchievementAnnouncement[];
      payload:
        | {
            type: "view";
            view: DiceShopViewModel;
            ephemeral?: boolean;
          }
        | {
            type: "message";
            content: string;
            ephemeral: boolean;
          };
    }
  | {
      kind: "update" | "edit";
      achievementAnnouncements?: AchievementAnnouncement[];
      payload:
        | {
            type: "view";
            view: DiceShopViewModel;
          }
        | {
            type: "message";
            content: string;
            clearComponents?: boolean;
          };
    };

type ShopPurchaseAttempt =
  | {
      ok: false;
      reason: "already-owned";
      item: DiceShopItem;
    }
  | {
      ok: false;
      reason: "insufficient-pips";
      item: DiceShopItem;
      currentPips: number;
    }
  | {
      ok: true;
      item: DiceShopItem;
      quantity: number;
      remainingPips: number;
      newlyEarned: ReturnType<DiceProgressionRepository["awardAchievements"]>;
    };

type ManageShopDependencies = {
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getEconomySnapshot" | "getPips">;
  inventory: Pick<
    DiceInventoryRepository,
    "getInventoryQuantities" | "grantInventoryItem" | "recordShopPurchase"
  >;
  progression: Pick<DiceProgressionRepository, "awardAchievements">;
  shopCatalog: DiceShopCatalog;
  unitOfWork: UnitOfWork;
  useDiceItem: (input: {
    userId: string;
    itemId: string;
    reserveAutoRollSession: ReserveAutoRollSession;
    triggerRandomGroupEvent: TriggerRandomGroupEvent;
  }) => Promise<UseDiceItemResult>;
};

export const createDiceShopUseCase = ({
  economy,
  inventory,
  progression,
  shopCatalog,
  unitOfWork,
  useDiceItem,
}: ManageShopDependencies) => {
  const createDiceShopReply = (userId: string): DiceShopResult => {
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildLandingViewModel(economy, shopCatalog, userId),
        ephemeral: false,
      },
    };
  };

  const handleDiceShopAction = async (
    actorId: string,
    action: DiceShopAction,
    options: {
      reserveAutoRollSession: ReserveAutoRollSession;
      triggerRandomGroupEvent: TriggerRandomGroupEvent;
    },
  ): Promise<DiceShopActionOutcome> => {
    if (actorId !== action.ownerId) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: "This shop menu is not assigned to you.",
            ephemeral: true,
          },
        },
      };
    }

    if (action.type === "close") {
      return {
        result: {
          kind: "update",
          payload: {
            type: "message",
            content: "Shop closed.",
            clearComponents: true,
          },
        },
      };
    }

    if (action.type === "view-home") {
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildLandingViewModel(economy, shopCatalog, action.ownerId),
          },
        },
      };
    }

    const category = getDiceShopCategoryDefinition(action.categoryId);
    if (!category) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: "That shop category does not exist.",
            ephemeral: true,
          },
        },
      };
    }

    if (action.type === "open-category") {
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildCategoryViewModel(economy, inventory, shopCatalog, action.ownerId, category),
          },
        },
      };
    }

    if (action.type === "page-category") {
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildCategoryViewModel(
              economy,
              inventory,
              shopCatalog,
              action.ownerId,
              category,
              action.page,
            ),
          },
        },
      };
    }

    const item = shopCatalog.getDiceShopItem(action.itemId);
    if (!item || getDiceShopCategoryId(item) !== category.id) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: "That shop item does not exist.",
            ephemeral: true,
          },
        },
      };
    }

    if (action.type === "prompt-use-item") {
      if (!item.consumable) {
        return {
          result: {
            kind: "reply",
            payload: {
              type: "message",
              content: `${item.name} cannot be consumed.`,
              ephemeral: true,
            },
          },
        };
      }

      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildUseItemConfirmationViewModel(
              economy,
              shopCatalog,
              action.ownerId,
              category,
              item,
            ),
          },
        },
      };
    }

    if (action.type === "select-item") {
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildItemDetailViewModel(
              economy,
              inventory,
              shopCatalog,
              action.ownerId,
              category,
              item.id,
            ),
          },
        },
      };
    }

    if (action.type === "view-adjacent-item") {
      const adjacentItem = getAdjacentCategoryItem(
        shopCatalog,
        category.id,
        action.itemId,
        action.direction,
      );
      if (!adjacentItem) {
        return {
          result: {
            kind: "reply",
            payload: {
              type: "message",
              content: "That shop item does not exist.",
              ephemeral: true,
            },
          },
        };
      }

      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildItemDetailViewModel(
              economy,
              inventory,
              shopCatalog,
              action.ownerId,
              category,
              adjacentItem.id,
            ),
          },
        },
      };
    }

    if (action.type === "confirm-use-item") {
      const useResult = await useDiceItem({
        userId: action.ownerId,
        itemId: item.id,
        reserveAutoRollSession: options.reserveAutoRollSession,
        triggerRandomGroupEvent: options.triggerRandomGroupEvent,
      });
      if (!useResult.ok) {
        return {
          result: {
            kind: "reply",
            payload: {
              type: "message",
              content: useResult.message,
              ephemeral: true,
            },
          },
        };
      }

      if (useResult.autoRollReservation) {
        return {
          result: {
            kind: "update",
            achievementAnnouncements: useResult.achievementAnnouncements,
            payload: {
              type: "message",
              content: `${useResult.item.name} engaged.`,
              clearComponents: true,
            },
          },
          autoRollStart: {
            reservation: useResult.autoRollReservation,
            itemId: useResult.item.id,
          },
        };
      }

      return {
        result: {
          kind: "update",
          achievementAnnouncements: useResult.achievementAnnouncements,
          payload: {
            type: "view",
            view: buildLandingViewModel(
              economy,
              shopCatalog,
              action.ownerId,
              useResult.statusMessage,
            ),
          },
        },
      };
    }

    const purchase = unitOfWork.runInTransaction<ShopPurchaseAttempt>(() => {
      const ownedQuantity = inventory.getInventoryQuantities(action.ownerId).get(item.id) ?? 0;
      if (isPassivePermanentItem(item) && ownedQuantity > 0) {
        return {
          ok: false,
          reason: "already-owned",
          item,
        };
      }

      const currentPips = economy.getPips(action.ownerId);
      if (currentPips < item.pricePips) {
        return {
          ok: false,
          reason: "insufficient-pips",
          item,
          currentPips,
        };
      }

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
        ok: true,
        item,
        quantity,
        remainingPips: economy.getPips(action.ownerId),
        newlyEarned,
      };
    });

    if (!purchase.ok) {
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildItemDetailViewModel(
              economy,
              inventory,
              shopCatalog,
              action.ownerId,
              category,
              item.id,
              purchase.reason === "already-owned"
                ? buildAlreadyOwnedMessage(purchase.item)
                : buildInsufficientPipsMessage(purchase.item, purchase.currentPips),
            ),
          },
        },
      };
    }

    return {
      result: {
        kind: "update",
        achievementAnnouncements: [
          createAchievementAnnouncement(action.ownerId, purchase.newlyEarned),
        ].flatMap((announcement) => (announcement ? [announcement] : [])),
        payload: {
          type: "view",
          view: buildPurchaseReceiptViewModel(shopCatalog, action.ownerId, purchase),
        },
      },
    };
  };

  return {
    createDiceShopReply,
    handleDiceShopAction,
  };
};

const buildLandingViewModel = (
  economy: Pick<DiceEconomyRepository, "getEconomySnapshot">,
  shopCatalog: DiceShopCatalog,
  userId: string,
  statusMessage?: string,
): DiceShopViewModel => {
  return {
    screen: "landing",
    ownerId: userId,
    balancePips: economy.getEconomySnapshot(userId).pips,
    categorySummaries: buildCategorySummaries(shopCatalog),
    statusMessage,
  };
};

const buildCategoryViewModel = (
  economy: Pick<DiceEconomyRepository, "getEconomySnapshot">,
  inventory: Pick<DiceInventoryRepository, "getInventoryQuantities">,
  shopCatalog: DiceShopCatalog,
  userId: string,
  category: DiceShopCategoryDefinition,
  requestedPage: number = 0,
  statusMessage?: string,
): DiceShopViewModel => {
  const inventoryQuantities = inventory.getInventoryQuantities(userId);
  const categoryItems = getCategoryItems(shopCatalog, category.id).map((item) => ({
    id: item.id,
    name: item.name,
    pricePips: item.pricePips,
    ownedQuantity: inventoryQuantities.get(item.id) ?? 0,
    ownedSummary: buildOwnedSummary(category.id, inventoryQuantities.get(item.id) ?? 0),
  }));
  const pages = paginateCategoryItems(categoryItems);
  const totalPages = Math.max(1, pages.length);
  const currentPage = clampPage(requestedPage, totalPages);

  return {
    screen: "category",
    ownerId: userId,
    balancePips: economy.getEconomySnapshot(userId).pips,
    categorySummaries: buildCategorySummaries(shopCatalog),
    categoryId: category.id,
    categoryLabel: category.label,
    categorySummary: category.summary,
    currentPage,
    totalPages,
    categoryItems: pages[currentPage] ?? [],
    statusMessage,
  };
};

const buildItemDetailViewModel = (
  economy: Pick<DiceEconomyRepository, "getEconomySnapshot">,
  inventory: Pick<DiceInventoryRepository, "getInventoryQuantities">,
  shopCatalog: DiceShopCatalog,
  userId: string,
  category: DiceShopCategoryDefinition,
  itemId: string,
  statusMessage?: string,
): DiceShopViewModel => {
  const item = shopCatalog.getDiceShopItem(itemId);
  if (!item || getDiceShopCategoryId(item) !== category.id) {
    throw new Error(`Missing shop item detail for ${itemId} in category ${category.id}.`);
  }

  const balancePips = economy.getEconomySnapshot(userId).pips;
  const inventoryQuantities = inventory.getInventoryQuantities(userId);
  const ownedQuantity = inventoryQuantities.get(item.id) ?? 0;
  const alreadyOwned = isPassivePermanentItem(item) && ownedQuantity > 0;
  const hasEnoughPips = balancePips >= item.pricePips;
  const buyable = !alreadyOwned && hasEnoughPips;
  const itemNavigation = buildItemNavigation(shopCatalog, category.id, item.id);
  const categoryPages = paginateCategoryItems(
    getCategoryItems(shopCatalog, category.id).map((categoryItem) => {
      const categoryOwnedQuantity = inventoryQuantities.get(categoryItem.id) ?? 0;
      return {
        id: categoryItem.id,
        name: categoryItem.name,
        pricePips: categoryItem.pricePips,
        ownedQuantity: categoryOwnedQuantity,
        ownedSummary: buildOwnedSummary(category.id, categoryOwnedQuantity),
      };
    }),
  );
  const categoryTotalPages = Math.max(1, categoryPages.length);
  const categoryPage = findCategoryPageIndex(categoryPages, item.id);

  return {
    screen: "item-detail",
    ownerId: userId,
    balancePips,
    categorySummaries: buildCategorySummaries(shopCatalog),
    categoryId: category.id,
    categoryLabel: category.label,
    categoryPage,
    categoryTotalPages,
    itemNavigation,
    selectedItem: {
      id: item.id,
      name: item.name,
      description: item.description,
      pricePips: item.pricePips,
      ownedQuantity,
      typeLabel: category.singularLabel,
      buyable,
      buyDisabledReason: alreadyOwned
        ? "Already owned. Permanent upgrades can only be bought once."
        : hasEnoughPips
          ? undefined
          : `You need ${item.pricePips} pips. Current balance: ${balancePips} pips.`,
    },
    statusMessage,
  };
};

const buildPurchaseReceiptViewModel = (
  shopCatalog: DiceShopCatalog,
  userId: string,
  purchase: Extract<ShopPurchaseAttempt, { ok: true }>,
): DiceShopViewModel => {
  return {
    screen: "purchase-receipt",
    ownerId: userId,
    balancePips: purchase.remainingPips,
    categorySummaries: buildCategorySummaries(shopCatalog),
    receipt: {
      itemId: purchase.item.id,
      categoryId: getDiceShopCategoryId(purchase.item),
      itemName: purchase.item.name,
      ownedQuantity: purchase.quantity,
      remainingPips: purchase.remainingPips,
      changeSummary: buildPurchaseChangeSummary(purchase.item),
      canUseItemNow: purchase.item.consumable,
    },
  };
};

const buildUseItemConfirmationViewModel = (
  economy: Pick<DiceEconomyRepository, "getEconomySnapshot">,
  shopCatalog: DiceShopCatalog,
  userId: string,
  category: DiceShopCategoryDefinition,
  item: DiceShopItem,
): DiceShopViewModel => {
  return {
    screen: "use-item-confirmation",
    ownerId: userId,
    balancePips: economy.getEconomySnapshot(userId).pips,
    categorySummaries: buildCategorySummaries(shopCatalog),
    categoryId: category.id,
    itemId: item.id,
    itemName: item.name,
  };
};

const buildCategorySummaries = (shopCatalog: DiceShopCatalog): DiceShopCategorySummary[] => {
  return diceShopCategories.map((category) => ({
    id: category.id,
    label: category.label,
    summary: category.summary,
    itemCount: getCategoryItems(shopCatalog, category.id).length,
  }));
};

const getCategoryItems = (shopCatalog: DiceShopCatalog, categoryId: DiceShopCategoryId) => {
  return shopCatalog
    .getDiceShopItems()
    .filter((item) => getDiceShopCategoryId(item) === categoryId);
};

const paginateCategoryItems = (
  items: DiceShopCategoryItemSummary[],
): DiceShopCategoryItemSummary[][] => {
  if (items.length < 1) {
    return [[]];
  }

  const pages: DiceShopCategoryItemSummary[][] = [];
  let currentPageItems: DiceShopCategoryItemSummary[] = [];
  let currentFieldLength = 0;

  for (const item of items) {
    const itemLineLength = buildCategoryItemFieldLine(item).length;
    const candidateLength =
      currentPageItems.length < 1 ? itemLineLength : currentFieldLength + 1 + itemLineLength;
    const exceedsBudget =
      currentPageItems.length >= discordStringSelectOptionLimit ||
      candidateLength > discordEmbedFieldValueCharacterLimit;

    if (currentPageItems.length > 0 && exceedsBudget) {
      pages.push(currentPageItems);
      currentPageItems = [item];
      currentFieldLength = itemLineLength;
      continue;
    }

    currentPageItems.push(item);
    currentFieldLength = candidateLength;
  }

  if (currentPageItems.length > 0) {
    pages.push(currentPageItems);
  }

  return pages;
};

const findCategoryPageIndex = (pages: DiceShopCategoryItemSummary[][], itemId: string): number => {
  const pageIndex = pages.findIndex((page) => page.some((item) => item.id === itemId));
  return pageIndex >= 0 ? pageIndex : 0;
};

const getAdjacentCategoryItem = (
  shopCatalog: DiceShopCatalog,
  categoryId: DiceShopCategoryId,
  itemId: string,
  direction: DiceShopItemNavigationDirection,
) => {
  const items = getCategoryItems(shopCatalog, categoryId);
  const currentIndex = items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) {
    return null;
  }

  const adjacentIndex = direction === "previous" ? currentIndex - 1 : currentIndex + 1;
  return items[adjacentIndex] ?? items[currentIndex] ?? null;
};

const buildItemNavigation = (
  shopCatalog: DiceShopCatalog,
  categoryId: DiceShopCategoryId,
  itemId: string,
): DiceShopItemNavigation => {
  const items = getCategoryItems(shopCatalog, categoryId);
  const currentIndex = items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) {
    throw new Error(`Missing shop item navigation for ${itemId} in category ${categoryId}.`);
  }

  return {
    previousItemId: currentIndex > 0 ? (items[currentIndex - 1]?.id ?? null) : null,
    nextItemId: currentIndex < items.length - 1 ? (items[currentIndex + 1]?.id ?? null) : null,
  };
};

const getDiceShopCategoryDefinition = (
  categoryId: DiceShopCategoryId,
): DiceShopCategoryDefinition | null => {
  return diceShopCategories.find((category) => category.id === categoryId) ?? null;
};

const getDiceShopCategoryId = (item: DiceShopItem): DiceShopCategoryId => {
  return isPassivePermanentItem(item) ? "permanent-upgrades" : "consumables";
};

const buildAlreadyOwnedMessage = (item: DiceShopItem): string => {
  return `${item.name} is already owned. Permanent upgrades can only be bought once.`;
};

const buildInsufficientPipsMessage = (item: DiceShopItem, currentPips: number): string => {
  return `You need ${item.pricePips} pips to buy ${item.name}. Current balance: ${currentPips} pips.`;
};

const buildPurchaseChangeSummary = (item: DiceShopItem): string => {
  if (isPassivePermanentItem(item)) {
    return "This permanent upgrade is now active.";
  }

  return "The item was added to your inventory. Use /inventory when you want to activate it.";
};

const buildOwnedSummary = (categoryId: DiceShopCategoryId, ownedQuantity: number): string => {
  if (categoryId === "permanent-upgrades") {
    return `Owned: ${ownedQuantity > 0 ? "✅" : "❌"}`;
  }

  return `Owned ${ownedQuantity}`;
};

const buildCategoryItemFieldLine = (item: DiceShopCategoryItemSummary): string => {
  return `**${item.name}** • ${item.pricePips} pips • ${item.ownedSummary}`;
};

const clampPage = (page: number, totalPages: number): number => {
  if (!Number.isInteger(page)) {
    return 0;
  }

  return Math.max(0, Math.min(totalPages - 1, page));
};
