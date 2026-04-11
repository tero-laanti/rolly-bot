import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import { formatDiscordRelativeTime } from "../../../../shared/discord";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import { awardManualDiceAchievements } from "../../../progression/application/achievement-awards";
import {
  createAchievementAnnouncement,
  type AchievementAnnouncement,
} from "../../../progression/application/achievement-announcements";
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import { getDiceGardenAchievementIds } from "../achievement-rules";
import type {
  DiceGardenPlot,
  DiceGardenRepository,
  DiceInventoryRepository,
  DiceShopCatalog,
} from "../ports";
import {
  getGardenBaseRewardPips,
  getGardenGrowDurationMs,
  rollGardenSeedOutcome,
} from "../../domain/garden";
import {
  getGardenSlotCount,
  mysteriousDieSeedItemId,
  seedSatchelItemId,
} from "../../domain/passive-items";

export type DiceGardenAction =
  | {
      type: "refresh";
      ownerId: string;
    }
  | {
      type: "plant";
      ownerId: string;
    }
  | {
      type: "harvest";
      ownerId: string;
    };

export type DiceGardenResult = ActionResult<DiceGardenAction>;

export type DiceGardenActionOutcome = {
  result: DiceGardenResult;
  achievementAnnouncements?: AchievementAnnouncement[];
};

type ManageGardenDependencies = {
  economy: Pick<DiceEconomyRepository, "grantRewardPips">;
  inventory: Pick<
    DiceInventoryRepository,
    "consumeInventoryItem" | "getInventoryQuantities" | "getInventoryQuantity"
  >;
  garden: DiceGardenRepository;
  progression: Pick<DiceProgressionRepository, "awardAchievements">;
  shopCatalog: DiceShopCatalog;
  unitOfWork: UnitOfWork;
};

export const createDiceGardenUseCase = ({
  economy,
  inventory,
  garden,
  progression,
  shopCatalog,
  unitOfWork,
}: ManageGardenDependencies) => {
  const createDiceGardenReply = (userId: string): DiceGardenResult => {
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildGardenView(inventory, garden, userId),
        ephemeral: false,
      },
    };
  };

  const handleDiceGardenAction = (
    actorId: string,
    action: DiceGardenAction,
  ): DiceGardenActionOutcome => {
    if (actorId !== action.ownerId) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: "This garden is not assigned to you.",
            ephemeral: true,
          },
        },
      };
    }

    if (action.type === "refresh") {
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildGardenView(inventory, garden, action.ownerId),
          },
        },
      };
    }

    const inventoryQuantities = inventory.getInventoryQuantities(action.ownerId);
    if (getGardenSlotCount(inventoryQuantities) < 1) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: "You don't have a Seed Satchel yet.",
            ephemeral: true,
          },
        },
      };
    }

    if (action.type === "plant") {
      const seedItem = shopCatalog.getDiceShopItem(mysteriousDieSeedItemId);
      if (!seedItem || seedItem.effect.type !== "garden-seed") {
        return {
          result: {
            kind: "reply",
            payload: {
              type: "message",
              content: "Garden seeds are unavailable right now.",
              ephemeral: true,
            },
          },
        };
      }
      const seedEffect = seedItem.effect;

      const activePlots = garden.getActiveGardenPlots(action.ownerId);
      if (activePlots.length >= getGardenSlotCount(inventoryQuantities)) {
        return {
          result: {
            kind: "reply",
            payload: {
              type: "message",
              content: "Your Seed Satchel is already full.",
              ephemeral: true,
            },
          },
        };
      }

      if (inventory.getInventoryQuantity(action.ownerId, seedItem.id) < 1) {
        return {
          result: {
            kind: "reply",
            payload: {
              type: "message",
              content: `You need a ${seedItem.name} before you can plant.`,
              ephemeral: true,
            },
          },
        };
      }

      const plantResult = unitOfWork.runInTransaction(() => {
        const consumed = inventory.consumeInventoryItem({
          userId: action.ownerId,
          itemId: seedItem.id,
        });
        if (!consumed.ok) {
          return {
            ok: false as const,
            message: `You need a ${seedItem.name} before you can plant.`,
          };
        }

        const outcome = rollGardenSeedOutcome(seedEffect.outcomes);
        const plantedAtMs = Date.now();
        const plantedAt = new Date(plantedAtMs).toISOString();
        const readyAt = new Date(
          plantedAtMs + getGardenGrowDurationMs(outcome.sides),
        ).toISOString();
        const plot = garden.createGardenPlot({
          userId: action.ownerId,
          slotIndex: 0,
          seedItemId: seedItem.id,
          dieSides: outcome.sides,
          plantedAt,
          readyAt,
        });
        const gardenStats = garden.recordGardenPlant(action.ownerId);
        const newlyEarned = awardManualDiceAchievements(
          progression,
          action.ownerId,
          getDiceGardenAchievementIds(gardenStats),
        );

        return {
          ok: true as const,
          plot,
          remainingSeeds: consumed.remainingQuantity,
          newlyEarned,
        };
      });

      if (!plantResult.ok) {
        return {
          result: {
            kind: "reply",
            payload: {
              type: "message",
              content: plantResult.message,
              ephemeral: true,
            },
          },
        };
      }

      const seedLabel = plantResult.remainingSeeds === 1 ? "seed" : "seeds";
      return {
        result: {
          kind: "update",
          payload: {
            type: "view",
            view: buildGardenView(
              inventory,
              garden,
              action.ownerId,
              [
                `You planted a Mystery Die Seed. You have ${plantResult.remainingSeeds} ${seedLabel} left.`,
                `A d${plantResult.plot.dieSides} sapling took root in your garden.`,
              ].join("\n"),
            ),
          },
        },
        achievementAnnouncements: [
          createAchievementAnnouncement(action.ownerId, plantResult.newlyEarned),
        ].flatMap((announcement) => (announcement ? [announcement] : [])),
      };
    }

    const activePlot = garden.getActiveGardenPlots(action.ownerId)[0] ?? null;
    if (!activePlot) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: "Nothing is ready to harvest.",
            ephemeral: true,
          },
        },
      };
    }

    const readyAtMs = Date.parse(activePlot.readyAt);
    if (Number.isNaN(readyAtMs) || readyAtMs > Date.now()) {
      return {
        result: {
          kind: "reply",
          payload: {
            type: "message",
            content: "That sapling is still growing.",
            ephemeral: true,
          },
        },
      };
    }

    const harvestResult = unitOfWork.runInTransaction(() => {
      const awarded = economy.grantRewardPips({
        userId: action.ownerId,
        baseAmount: getGardenBaseRewardPips(activePlot.dieSides),
      });
      garden.clearGardenPlot({
        userId: action.ownerId,
        slotIndex: activePlot.slotIndex,
      });
      const gardenStats = garden.recordGardenHarvest({
        userId: action.ownerId,
        dieSides: activePlot.dieSides,
      });
      const newlyEarned = awardManualDiceAchievements(
        progression,
        action.ownerId,
        getDiceGardenAchievementIds(gardenStats),
      );

      return {
        awardedAmount: awarded.awardedAmount,
        newlyEarned,
      };
    });

    return {
      result: {
        kind: "update",
        payload: {
          type: "view",
          view: buildGardenView(
            inventory,
            garden,
            action.ownerId,
            [
              `You harvested your d${activePlot.dieSides} sapling.`,
              `It burst into a ${harvestResult.awardedAmount} pips.`,
            ].join("\n"),
          ),
        },
      },
      achievementAnnouncements: [
        createAchievementAnnouncement(action.ownerId, harvestResult.newlyEarned),
      ].flatMap((announcement) => (announcement ? [announcement] : [])),
    };
  };

  return {
    createDiceGardenReply,
    handleDiceGardenAction,
  };
};

const buildGardenView = (
  inventory: Pick<DiceInventoryRepository, "getInventoryQuantities" | "getInventoryQuantity">,
  garden: Pick<DiceGardenRepository, "getActiveGardenPlots">,
  userId: string,
  statusLine?: string,
): ActionView<DiceGardenAction> => {
  const inventoryQuantities = inventory.getInventoryQuantities(userId);
  const slotCount = getGardenSlotCount(inventoryQuantities);
  if (slotCount < 1) {
    return {
      content: [
        ...(statusLine ? [statusLine, ""] : []),
        "You don't have a Seed Satchel yet.",
        "Buy Seed Satchel from /shop to unlock your garden.",
      ].join("\n"),
      components: [],
    };
  }

  const activePlot = garden.getActiveGardenPlots(userId)[0] ?? null;
  const seedCount = inventory.getInventoryQuantity(userId, mysteriousDieSeedItemId);

  return {
    content: buildGardenContent(activePlot, seedCount, statusLine),
    components: buildGardenComponents(userId, activePlot, seedCount),
  };
};

const buildGardenContent = (
  activePlot: DiceGardenPlot | null,
  seedCount: number,
  statusLine?: string,
): string => {
  const lines = [
    ...(statusLine ? [statusLine, ""] : []),
    "**Seed Satchel**",
  ];

  if (!activePlot) {
    lines.push("Status: empty.");
    if (seedCount > 0) {
      lines.push("Your satchel is ready for a seed.");
    } else {
      lines.push("You don't have any Mysterious Die Seeds right now. Visit /shop.");
    }

    return lines.join("\n");
  }

  const readyAtMs = Date.parse(activePlot.readyAt);
  const isReady = !Number.isNaN(readyAtMs) && readyAtMs <= Date.now();
  lines.push(`Status: ${isReady ? "ready" : "growing"}.`);

  if (isReady) {
    lines.push(`Your d${activePlot.dieSides} sapling is ready to harvest.`);
  } else {
    lines.push(`A d${activePlot.dieSides} sapling is growing.`);
    lines.push(
      Number.isNaN(readyAtMs)
        ? "Ready to harvest soon."
        : `Ready to harvest ${formatDiscordRelativeTime(readyAtMs)}.`,
    );
  }

  return lines.join("\n");
};

const buildGardenComponents = (
  userId: string,
  activePlot: DiceGardenPlot | null,
  seedCount: number,
): ActionView<DiceGardenAction>["components"] => {
  if (!activePlot) {
    const buttons: Array<{
      action: DiceGardenAction;
      label: string;
      style: "primary" | "secondary" | "success";
      disabled?: boolean;
    }> = [];

    if (seedCount > 0) {
      buttons.push({
        action: { type: "plant", ownerId: userId },
        label: "Plant Seed",
        style: "success",
      });
    }

    buttons.push({
      action: { type: "refresh", ownerId: userId },
      label: "Refresh",
      style: "secondary",
    });

    return [buttons];
  }

  const readyAtMs = Date.parse(activePlot.readyAt);
  const isReady = !Number.isNaN(readyAtMs) && readyAtMs <= Date.now();
  return [
    [
      {
        action: isReady
          ? { type: "harvest", ownerId: userId }
          : { type: "refresh", ownerId: userId },
        label: isReady ? "Harvest" : "Refresh",
        style: isReady ? "success" : "secondary",
      },
    ],
  ];
};

export const isGardenLockedForUser = (
  inventory: Pick<DiceInventoryRepository, "getInventoryQuantities">,
  userId: string,
): boolean => {
  return getGardenSlotCount(inventory.getInventoryQuantities(userId)) < 1;
};

export const getSeedSatchelItemId = (): string => seedSatchelItemId;

