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
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import { awardManualDiceAchievements } from "../../../progression/application/achievement-awards";
import {
  createAchievementAnnouncement,
  type AchievementAnnouncement,
} from "../../../progression/application/achievement-announcements";
import { hourMs } from "../../../../shared/time";
import { getDiceItemAchievementIds } from "../achievement-rules";
import {
  getBadLuckUmbrellaShieldMagnitude,
  getCleanseSaltShieldCharges,
} from "../../domain/passive-items";

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
      achievementAnnouncements?: AchievementAnnouncement[];
      autoRollReservation?: AutoRollSessionReservation;
    };

type UseDiceItemDependencies = {
  inventory: Pick<
    DiceInventoryRepository,
    | "consumeInventoryItem"
    | "getInventoryQuantities"
    | "getInventoryQuantity"
    | "grantInventoryItem"
    | "recordItemUse"
  >;
  itemEffects: DiceItemEffectsService;
  pvp: Pick<DicePvpRepository, "getActiveDiceLockout" | "setDicePvpEffects">;
  progression: Pick<DiceProgressionRepository, "awardAchievements">;
  shopCatalog: Pick<DiceShopCatalog, "getDiceShopItem">;
  unitOfWork: UnitOfWork;
};

export type FinalizeAutoRollItemUseResult = {
  achievementAnnouncements?: AchievementAnnouncement[];
};

const activeItemDoubleRollMessage =
  "You already have an item providing a roll set multiplier, please finish that usage before using another one!";

const recordDiceItemUseAchievements = ({
  inventory,
  progression,
  userId,
  itemId,
}: {
  inventory: Pick<DiceInventoryRepository, "recordItemUse">;
  progression: Pick<DiceProgressionRepository, "awardAchievements">;
  userId: string;
  itemId: string;
}) => {
  const newlyEarned = awardManualDiceAchievements(
    progression,
    userId,
    getDiceItemAchievementIds(inventory.recordItemUse({ userId, itemId })),
  );

  return {
    newlyEarned,
    achievementAnnouncement: createAchievementAnnouncement(userId, newlyEarned),
  };
};

export const createFinalizeAutoRollItemUseUseCase = ({
  inventory,
  progression,
  unitOfWork,
}: Pick<UseDiceItemDependencies, "inventory" | "progression" | "unitOfWork">) => {
  return ({
    userId,
    itemId,
  }: {
    userId: string;
    itemId: string;
  }): FinalizeAutoRollItemUseResult => {
    return unitOfWork.runInTransaction(() => {
      const { achievementAnnouncement } = recordDiceItemUseAchievements({
        inventory,
        progression,
        userId,
        itemId,
      });

      return {
        achievementAnnouncements: achievementAnnouncement ? [achievementAnnouncement] : [],
      };
    });
  };
};

export const createUseDiceItemUseCase = ({
  inventory,
  itemEffects,
  pvp,
  progression,
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

    if (item.effect.type === "garden-seed") {
      return {
        ok: false,
        message: `Use /garden to plant ${item.name}.`,
      };
    }

    if (item.effect.type === "negative-effect-shield") {
      const effect = item.effect;
      const ownedQuantities = inventory.getInventoryQuantities(userId);
      const shieldMagnitude = getBadLuckUmbrellaShieldMagnitude(ownedQuantities);
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
          magnitude: shieldMagnitude,
        });
        const { achievementAnnouncement } = recordDiceItemUseAchievements({
          inventory,
          progression,
          userId,
          itemId: item.id,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage:
            shieldMagnitude > 1
              ? `${item.name} opened. The next negative effect will be blocked, and lockouts lose up to ${shieldMagnitude} hours instead.`
              : `${item.name} opened. The next negative effect will be blocked, but lockouts only lose 1 hour.`,
          achievementAnnouncements: achievementAnnouncement ? [achievementAnnouncement] : [],
        };
      });
    }

    if (item.effect.type === "double-roll-uses") {
      const effect = item.effect;
      const activeDoubleRoll = itemEffects.getItemDoubleRollStatus(userId);
      if (activeDoubleRoll.isActive) {
        return {
          ok: false,
          message: activeItemDoubleRollMessage,
        };
      }

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
        const { achievementAnnouncement } = recordDiceItemUseAchievements({
          inventory,
          progression,
          userId,
          itemId: item.id,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: `${item.name} loaded. Your next ${effect.uses} /roll uses roll twice.`,
          achievementAnnouncements: achievementAnnouncement ? [achievementAnnouncement] : [],
        };
      });
    }

    if (item.effect.type === "double-roll-duration") {
      const effect = item.effect;
      const activeDoubleRoll = itemEffects.getItemDoubleRollStatus(userId);
      if (activeDoubleRoll.isActive) {
        return {
          ok: false,
          message: activeItemDoubleRollMessage,
        };
      }

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
        const { achievementAnnouncement } = recordDiceItemUseAchievements({
          inventory,
          progression,
          userId,
          itemId: item.id,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: `${item.name} activated. Your /roll uses roll twice for ${effect.minutes} minutes.`,
          achievementAnnouncements: achievementAnnouncement ? [achievementAnnouncement] : [],
        };
      });
    }

    if (item.effect.type === "cleanse-all-negative-effects") {
      const ownedQuantities = inventory.getInventoryQuantities(userId);
      const bonusShieldCharges = getCleanseSaltShieldCharges(ownedQuantities);
      return unitOfWork.runInTransaction(() => {
        const nowMs = Date.now();
        const clearedTemporaryEffects = itemEffects.clearAllNegativeTemporaryEffects(userId);
        const activeLockoutUntilMs = pvp.getActiveDiceLockout(userId, nowMs);
        const hadActiveLockout = activeLockoutUntilMs !== null;
        const reducedLockoutUntilMs =
          activeLockoutUntilMs === null ? null : Math.max(nowMs, activeLockoutUntilMs - hourMs);
        const lockoutWasFullyCleared =
          activeLockoutUntilMs !== null &&
          reducedLockoutUntilMs !== null &&
          reducedLockoutUntilMs <= nowMs;
        if (hadActiveLockout) {
          pvp.setDicePvpEffects({
            userId,
            lockoutUntil:
              reducedLockoutUntilMs !== null && reducedLockoutUntilMs > nowMs
                ? new Date(reducedLockoutUntilMs).toISOString()
                : null,
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
        if (bonusShieldCharges > 0) {
          itemEffects.grantNegativeEffectShield({
            userId,
            source: `item:${item.id}:passive-clean-room-kit`,
            charges: bonusShieldCharges,
          });
        }
        const { achievementAnnouncement } = recordDiceItemUseAchievements({
          inventory,
          progression,
          userId,
          itemId: item.id,
        });

        const clearedParts: string[] = [];
        if (clearedTemporaryEffects > 0) {
          clearedParts.push(
            `${clearedTemporaryEffects} negative temporary effect${clearedTemporaryEffects === 1 ? "" : "s"}`,
          );
        }
        if (hadActiveLockout) {
          clearedParts.push(
            lockoutWasFullyCleared ? "active lockout" : "1 hour from active lockout",
          );
        }

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: [
            `${item.name} removed ${clearedParts.join(" and ")}.`,
            bonusShieldCharges > 0
              ? `Clean Room Kit also granted ${bonusShieldCharges} Bad Luck Umbrella charge${bonusShieldCharges === 1 ? "" : "s"}.`
              : "",
          ]
            .filter((part) => part.length > 0)
            .join(" "),
          achievementAnnouncements: achievementAnnouncement ? [achievementAnnouncement] : [],
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

      const { achievementAnnouncement } = recordDiceItemUseAchievements({
        inventory,
        progression,
        userId,
        itemId: item.id,
      });

      return {
        ok: true,
        item,
        remainingQuantity: consumed.remainingQuantity,
        statusMessage: "Chaos Flare triggered a random group event.",
        achievementAnnouncements: achievementAnnouncement ? [achievementAnnouncement] : [],
      };
    }

    if (item.effect.type === "auto-roll-session") {
      const consumed = inventory.consumeInventoryItem({ userId, itemId: item.id });
      if (!consumed.ok) {
        return {
          ok: false,
          message: `You do not have any ${item.name} to use.`,
        };
      }

      const reservation = reserveAutoRollSession({
        userId,
        itemName: item.name,
        durationSeconds: item.effect.durationSeconds,
        intervalSeconds: item.effect.intervalSeconds,
      });
      if (!reservation) {
        inventory.grantInventoryItem({ userId, itemId: item.id, quantity: 1 });
        return {
          ok: false,
          message: "You already have an active auto-roll session.",
        };
      }

      return {
        ok: true,
        item,
        remainingQuantity: consumed.remainingQuantity,
        statusMessage: `${item.name} engaged.`,
        autoRollReservation: reservation,
      };
    }

    return {
      ok: false,
      message: `${item.name} cannot be consumed.`,
    };
  };
};
