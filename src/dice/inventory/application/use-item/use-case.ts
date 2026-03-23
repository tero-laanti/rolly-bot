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
import { getDiceItemAchievementIds } from "../achievement-rules";
import {
  appendAchievementUnlockText,
  formatAchievementUnlockText,
} from "../../../progression/application/achievement-text";
import { getBadLuckUmbrellaCharges, getCleanseSaltShieldCharges } from "../../domain/passive-items";

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
      achievementText?: string;
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
  achievementText?: string;
};

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
    achievementText: formatAchievementUnlockText(newlyEarned) || undefined,
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
      const { achievementText } = recordDiceItemUseAchievements({
        inventory,
        progression,
        userId,
        itemId,
      });

      return {
        achievementText,
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

    if (item.effect.type === "negative-effect-shield") {
      const effect = item.effect;
      const ownedQuantities = inventory.getInventoryQuantities(userId);
      const grantedCharges = getBadLuckUmbrellaCharges(effect.charges, ownedQuantities);
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
          charges: grantedCharges,
        });
        const { newlyEarned, achievementText } = recordDiceItemUseAchievements({
          inventory,
          progression,
          userId,
          itemId: item.id,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: appendAchievementUnlockText(
            grantedCharges > effect.charges
              ? `${item.name} opened. The next ${grantedCharges} negative effects will be blocked.`
              : `${item.name} opened. The next negative effect will be blocked.`,
            newlyEarned,
          ),
          achievementText: achievementText || undefined,
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
        const { newlyEarned, achievementText } = recordDiceItemUseAchievements({
          inventory,
          progression,
          userId,
          itemId: item.id,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: appendAchievementUnlockText(
            `${item.name} loaded. Your next ${effect.uses} /roll uses roll twice.`,
            newlyEarned,
          ),
          achievementText: achievementText || undefined,
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
        const { newlyEarned, achievementText } = recordDiceItemUseAchievements({
          inventory,
          progression,
          userId,
          itemId: item.id,
        });

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: appendAchievementUnlockText(
            `${item.name} activated. Your /roll uses roll twice for ${effect.minutes} minutes.`,
            newlyEarned,
          ),
          achievementText: achievementText || undefined,
        };
      });
    }

    if (item.effect.type === "cleanse-all-negative-effects") {
      const ownedQuantities = inventory.getInventoryQuantities(userId);
      const bonusShieldCharges = getCleanseSaltShieldCharges(ownedQuantities);
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
        if (bonusShieldCharges > 0) {
          itemEffects.grantNegativeEffectShield({
            userId,
            source: `item:${item.id}:passive-clean-room-kit`,
            charges: bonusShieldCharges,
          });
        }
        const { newlyEarned, achievementText } = recordDiceItemUseAchievements({
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
          clearedParts.push("active lockout");
        }

        return {
          ok: true as const,
          item,
          remainingQuantity: consumed.remainingQuantity,
          statusMessage: appendAchievementUnlockText(
            [
              `${item.name} removed ${clearedParts.join(" and ")}.`,
              bonusShieldCharges > 0
                ? `Clean Room Kit also granted ${bonusShieldCharges} Bad Luck Umbrella charge${bonusShieldCharges === 1 ? "" : "s"}.`
                : "",
            ]
              .filter((part) => part.length > 0)
              .join(" "),
            newlyEarned,
          ),
          achievementText: achievementText || undefined,
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

      const { newlyEarned, achievementText } = recordDiceItemUseAchievements({
        inventory,
        progression,
        userId,
        itemId: item.id,
      });

      return {
        ok: true,
        item,
        remainingQuantity: consumed.remainingQuantity,
        statusMessage: appendAchievementUnlockText(
          "Chaos Flare triggered a random group event.",
          newlyEarned,
        ),
        achievementText: achievementText || undefined,
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
