import type { TriggerRandomEventNowResult } from "../../../random-events/application/ports";
import type { DiceShopItem } from "../../../inventory/domain/shop";
import type { DiceItemEffectsService } from "../item-effects-service";
import type {
  AutoRollSessionReservation,
  DiceInventoryRepository,
  DiceShopCatalog,
} from "../ports";
import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DicePvpRepository } from "../../../pvp/application/ports";

export type ReserveAutoRollSession = (input: {
  userId: string;
  itemName: string;
  durationSeconds: number;
  intervalSeconds: number;
}) => AutoRollSessionReservation | null;

export type TriggerRandomGroupEvent = () => Promise<TriggerRandomEventNowResult>;

export type UseDiceItemResult =
  | {
      ok: false;
      message: string;
    }
  | {
      ok: true;
      item: DiceShopItem;
      remainingQuantity: number;
      statusMessage: string;
      autoRollReservation?: AutoRollSessionReservation;
    };

type UseDiceItemDependencies = {
  inventory: Pick<
    DiceInventoryRepository,
    "consumeInventoryItem" | "getInventoryQuantity" | "grantInventoryItem"
  >;
  itemEffects: DiceItemEffectsService;
  pvp: Pick<DicePvpRepository, "getActiveDiceLockout" | "setDicePvpEffects">;
  shopCatalog: Pick<DiceShopCatalog, "getDiceShopItem">;
  unitOfWork: UnitOfWork;
};

export const createUseDiceItemUseCase = ({
  inventory,
  itemEffects,
  pvp,
  shopCatalog,
  unitOfWork,
}: UseDiceItemDependencies) => {
  return async ({
    userId,
    itemId,
    reserveAutoRollSession,
    triggerRandomGroupEvent,
  }: {
    userId: string;
    itemId: string;
    reserveAutoRollSession: ReserveAutoRollSession;
    triggerRandomGroupEvent: TriggerRandomGroupEvent;
  }): Promise<UseDiceItemResult> => {
    const item = shopCatalog.getDiceShopItem(itemId);
    if (!item) {
      return {
        ok: false,
        message: "That inventory item does not exist.",
      };
    }

    if (!item.consumable) {
      return {
        ok: false,
        message: `${item.name} cannot be consumed.`,
      };
    }

    const ownedQuantity = inventory.getInventoryQuantity(userId, item.id);
    if (ownedQuantity < 1) {
      return {
        ok: false,
        message: `You do not have any ${item.name} to use.`,
      };
    }

    if (item.effect.type === "negative-effect-shield") {
      const effect = item.effect;
      return unitOfWork.runInTransaction(() => {
        const consumed = inventory.consumeInventoryItem({ userId, itemId: item.id });
        if (!consumed.ok) {
          return {
            ok: false as const,
            message: `You do not have any ${item.name} to use.`,
          };
        }

        itemEffects.grantNegativeEffectShield({
          userId,
          source: `item:${item.id}`,
          charges: effect.charges,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: `${item.name} opened. The next negative effect will be blocked.`,
        };
      });
    }

    if (item.effect.type === "double-roll-uses") {
      const effect = item.effect;
      return unitOfWork.runInTransaction(() => {
        const consumed = inventory.consumeInventoryItem({ userId, itemId: item.id });
        if (!consumed.ok) {
          return {
            ok: false as const,
            message: `You do not have any ${item.name} to use.`,
          };
        }

        itemEffects.grantDoubleRollUses({
          userId,
          source: `item:${item.id}`,
          uses: effect.uses,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: `${item.name} loaded. Your next ${effect.uses} /dice uses roll twice.`,
        };
      });
    }

    if (item.effect.type === "double-roll-duration") {
      const effect = item.effect;
      return unitOfWork.runInTransaction(() => {
        const consumed = inventory.consumeInventoryItem({ userId, itemId: item.id });
        if (!consumed.ok) {
          return {
            ok: false as const,
            message: `You do not have any ${item.name} to use.`,
          };
        }

        itemEffects.grantDoubleRollDuration({
          userId,
          source: `item:${item.id}`,
          minutes: effect.minutes,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: `${item.name} activated. Your /dice uses roll twice for ${effect.minutes} minutes.`,
        };
      });
    }

    if (item.effect.type === "cleanse-all-negative-effects") {
      return unitOfWork.runInTransaction(() => {
        const clearedTemporaryEffects = itemEffects.clearAllNegativeTemporaryEffects(userId);
        const hadActiveLockout = pvp.getActiveDiceLockout(userId) !== null;
        if (hadActiveLockout) {
          pvp.setDicePvpEffects({
            userId,
            lockoutUntil: null,
          });
        }

        if (clearedTemporaryEffects < 1 && !hadActiveLockout) {
          return {
            ok: false as const,
            message: "You have no active negative effects to remove.",
          };
        }

        const consumed = inventory.consumeInventoryItem({ userId, itemId: item.id });
        if (!consumed.ok) {
          throw new Error(`Failed to consume ${item.id} after cleanse.`);
        }

        const clearedParts: string[] = [];
        if (clearedTemporaryEffects > 0) {
          clearedParts.push(
            `${clearedTemporaryEffects} negative temporary effect${clearedTemporaryEffects === 1 ? "" : "s"}`,
          );
        }
        if (hadActiveLockout) {
          clearedParts.push("active lockout");
        }

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: `${item.name} removed ${clearedParts.join(" and ")}.`,
        };
      });
    }

    if (item.effect.type === "trigger-random-group-event") {
      const consumed = inventory.consumeInventoryItem({ userId, itemId: item.id });
      if (!consumed.ok) {
        return {
          ok: false,
          message: `You do not have any ${item.name} to use.`,
        };
      }

      const triggerResult = await triggerRandomGroupEvent();
      if (!triggerResult.ok || !triggerResult.result?.created) {
        inventory.grantInventoryItem({ userId, itemId: item.id, quantity: 1 });

        const message = !triggerResult.ok
          ? triggerResult.reason === "disabled"
            ? "Random events are disabled in config."
            : triggerResult.reason === "active-event-exists"
              ? "A random event is already active."
              : "Random-event runtime is currently unavailable."
          : "No random group event was created.";

        return {
          ok: false,
          message,
        };
      }

      return {
        ok: true,
        item,
        remainingQuantity: consumed.remainingQuantity,
        statusMessage: `Chaos Flare triggered a random group event.`,
      };
    }

    const reservation = reserveAutoRollSession({
      userId,
      itemName: item.name,
      durationSeconds: item.effect.durationSeconds,
      intervalSeconds: item.effect.intervalSeconds,
    });
    if (!reservation) {
      return {
        ok: false,
        message: "You already have an active auto-roll session.",
      };
    }

    const consumed = inventory.consumeInventoryItem({ userId, itemId: item.id });
    if (!consumed.ok) {
      return {
        ok: false,
        message: `You do not have any ${item.name} to use.`,
      };
    }

    return {
      ok: true,
      item,
      remainingQuantity: consumed.remainingQuantity,
      statusMessage: `${item.name} engaged.`,
      autoRollReservation: reservation,
    };
  };
};
