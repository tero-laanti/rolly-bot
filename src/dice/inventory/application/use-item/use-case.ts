import { grantInventoryItem } from "../../../inventory/domain/shop";
import type { TriggerRandomEventNowResult } from "../../../random-events/infrastructure/admin-controller";
import {
  clearAllNegativeTemporaryEffects,
  grantDoubleRollDuration,
  grantDoubleRollUses,
  grantNegativeEffectShield,
} from "../../../inventory/domain/item-effects";
import {
  consumeInventoryItem,
  getDiceShopItem,
  getInventoryQuantity,
  type DiceShopItem,
} from "../../../inventory/domain/shop";
import { getActiveDiceLockout, setDicePvpEffects } from "../../../pvp/domain/pvp";
import type { SqliteDatabase } from "../../../../shared/db";
import type { AutoRollSessionReservation } from "../../infrastructure/auto-roller-runtime";

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

export const useDiceItem = async (
  db: SqliteDatabase,
  {
    userId,
    itemId,
    reserveAutoRollSession,
    triggerRandomGroupEvent,
  }: {
    userId: string;
    itemId: string;
    reserveAutoRollSession: ReserveAutoRollSession;
    triggerRandomGroupEvent: TriggerRandomGroupEvent;
  },
): Promise<UseDiceItemResult> => {
  const item = getDiceShopItem(itemId);
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

  const ownedQuantity = getInventoryQuantity(db, userId, item.id);
  if (ownedQuantity < 1) {
    return {
      ok: false,
      message: `You do not have any ${item.name} to use.`,
    };
  }

  if (item.effect.type === "negative-effect-shield") {
    const effect = item.effect;
    return db.transaction(() => {
      const consumed = consumeInventoryItem(db, { userId, itemId: item.id });
      if (!consumed.ok) {
        return {
          ok: false as const,
          message: `You do not have any ${item.name} to use.`,
        };
      }

      grantNegativeEffectShield(db, {
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
    })();
  }

  if (item.effect.type === "double-roll-uses") {
    const effect = item.effect;
    return db.transaction(() => {
      const consumed = consumeInventoryItem(db, { userId, itemId: item.id });
      if (!consumed.ok) {
        return {
          ok: false as const,
          message: `You do not have any ${item.name} to use.`,
        };
      }

      grantDoubleRollUses(db, {
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
    })();
  }

  if (item.effect.type === "double-roll-duration") {
    const effect = item.effect;
    return db.transaction(() => {
      const consumed = consumeInventoryItem(db, { userId, itemId: item.id });
      if (!consumed.ok) {
        return {
          ok: false as const,
          message: `You do not have any ${item.name} to use.`,
        };
      }

      grantDoubleRollDuration(db, {
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
    })();
  }

  if (item.effect.type === "cleanse-all-negative-effects") {
    return db.transaction(() => {
      const clearedTemporaryEffects = clearAllNegativeTemporaryEffects(db, userId);
      const hadActiveLockout = getActiveDiceLockout(db, userId) !== null;
      if (hadActiveLockout) {
        setDicePvpEffects(db, {
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

      const consumed = consumeInventoryItem(db, { userId, itemId: item.id });
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
    })();
  }

  if (item.effect.type === "trigger-random-group-event") {
    const consumed = consumeInventoryItem(db, { userId, itemId: item.id });
    if (!consumed.ok) {
      return {
        ok: false,
        message: `You do not have any ${item.name} to use.`,
      };
    }

    const triggerResult = await triggerRandomGroupEvent();
    if (!triggerResult.ok || !triggerResult.result?.created) {
      grantInventoryItem(db, { userId, itemId: item.id, quantity: 1 });

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

  const consumed = consumeInventoryItem(db, { userId, itemId: item.id });
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
