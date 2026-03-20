import { minuteMs } from "../../../shared/time";
import { getDiceShopItem, type DiceShopItem, type DiceShopItemId } from "./shop";

export const umbrellaHarnessItemId = "umbrella-harness";
export const paddedBracersItemId = "padded-bracers";
export const cleanRoomKitItemId = "clean-room-kit";

export const isPassivePermanentItem = (item: DiceShopItem): boolean => {
  return (
    item.effect.type === "passive-extra-shield-on-umbrella" ||
    item.effect.type === "passive-pvp-loser-lockout-reduction" ||
    item.effect.type === "passive-cleanse-grants-negative-effect-shield"
  );
};

export const getItemOwnershipLabel = (item: DiceShopItem): string => {
  if (isPassivePermanentItem(item)) {
    return "Permanent passive upgrade.";
  }

  return item.consumable ? "Consumable." : "Permanent collectible.";
};

const hasOwnedItem = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
  itemId: DiceShopItemId,
): boolean => {
  return (ownedQuantities.get(itemId) ?? 0) > 0;
};

const getUmbrellaHarnessEffect = () => {
  const item = getDiceShopItem(umbrellaHarnessItemId);
  if (!item || item.effect.type !== "passive-extra-shield-on-umbrella") {
    return null;
  }

  return item.effect;
};

const getPaddedBracersEffect = () => {
  const item = getDiceShopItem(paddedBracersItemId);
  if (!item || item.effect.type !== "passive-pvp-loser-lockout-reduction") {
    return null;
  }

  return item.effect;
};

const getCleanRoomKitEffect = () => {
  const item = getDiceShopItem(cleanRoomKitItemId);
  if (!item || item.effect.type !== "passive-cleanse-grants-negative-effect-shield") {
    return null;
  }

  return item.effect;
};

export const getBadLuckUmbrellaCharges = (
  baseCharges: number,
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  if (!hasOwnedItem(ownedQuantities, umbrellaHarnessItemId)) {
    return baseCharges;
  }

  const effect = getUmbrellaHarnessEffect();
  return baseCharges + (effect?.extraCharges ?? 0);
};

export const getCleanseSaltShieldCharges = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  if (!hasOwnedItem(ownedQuantities, cleanRoomKitItemId)) {
    return 0;
  }

  const effect = getCleanRoomKitEffect();
  return effect?.charges ?? 0;
};

export const applyPvpLoserLockoutReduction = (
  durationMs: number,
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  if (!hasOwnedItem(ownedQuantities, paddedBracersItemId)) {
    return durationMs;
  }

  const effect = getPaddedBracersEffect();
  if (!effect) {
    return durationMs;
  }

  const reducedDurationMs = Math.floor(durationMs * (1 - effect.reductionPercent));
  return Math.max(effect.minimumMinutes * minuteMs, reducedDurationMs);
};
