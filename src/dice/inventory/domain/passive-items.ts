import { minuteMs } from "../../../shared/time";
import { getDiceShopItem, type DiceShopItem, type DiceShopItemId } from "./shop";

export const umbrellaHarnessItemId = "umbrella-harness";
export const paddedBracersItemId = "padded-bracers";
export const cleanRoomKitItemId = "clean-room-kit";
export const blacklistLedgerItemId = "blacklist-ledger";
export const pipMagnetItemId = "pip-magnet";
export const idleDynamoItemId = "idle-dynamo";
export const starterCoilItemId = "starter-coil";
export const capacitorBankItemId = "capacitor-bank";
export const seedSatchelItemId = "seed-satchel";
export const mysteriousDieSeedItemId = "mysterious-die-seed";

export type DicePersonalChargeBonus = {
  unlocked: boolean;
  minutesPerMultiplier: number;
  speedMultiplier: number;
  maxMultiplier: number;
};

export type DicePermanentBonuses = {
  extraBanSlots: number;
  pipRewardBonusPercent: number;
  personalCharge: DicePersonalChargeBonus;
};

export const isPassivePermanentItem = (item: DiceShopItem): boolean => {
  return (
    item.effect.type === "passive-garden-unlock" ||
    item.effect.type === "passive-extra-shield-on-umbrella" ||
    item.effect.type === "passive-pvp-loser-lockout-reduction" ||
    item.effect.type === "passive-cleanse-grants-negative-effect-shield" ||
    item.effect.type === "passive-extra-ban-slot" ||
    item.effect.type === "passive-pip-reward-bonus" ||
    item.effect.type === "passive-personal-charge-unlock" ||
    item.effect.type === "passive-personal-charge-speed-bonus" ||
    item.effect.type === "passive-personal-charge-cap-bonus"
  );
};

export const isRepeatablePassivePermanentItem = (item: DiceShopItem): boolean => {
  return isPassivePermanentItem(item) && Boolean(item.repeatablePricing);
};

export const getItemOwnershipLabel = (item: DiceShopItem): string => {
  if (isPassivePermanentItem(item)) {
    return item.repeatablePricing
      ? "Permanent passive upgrade. Stacks."
      : "Permanent passive upgrade.";
  }

  if (item.effect.type === "garden-seed") {
    return "Consumable. Plant with /garden.";
  }

  return item.consumable ? "Consumable." : "Permanent collectible.";
};

export const isDirectlyUsableConsumableItem = (item: DiceShopItem): boolean => {
  return item.consumable && item.effect.type !== "garden-seed";
};

const hasOwnedItem = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
  itemId: DiceShopItemId,
): boolean => {
  return (ownedQuantities.get(itemId) ?? 0) > 0;
};

const getOwnedCopies = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
  itemId: DiceShopItemId,
): number => {
  return Math.max(0, Math.floor(ownedQuantities.get(itemId) ?? 0));
};

const getPassiveItemEffect = <TType extends DiceShopItem["effect"]["type"]>(
  itemId: DiceShopItemId,
  effectType: TType,
): Extract<DiceShopItem["effect"], { type: TType }> | null => {
  const item = getDiceShopItem(itemId);
  if (!item || item.effect.type !== effectType) {
    return null;
  }

  return item.effect as Extract<DiceShopItem["effect"], { type: TType }>;
};

export const getDiceShopItemCurrentPricePips = (
  item: DiceShopItem,
  ownedQuantity: number,
): number => {
  const normalizedOwnedQuantity = Math.max(0, Math.floor(ownedQuantity));
  const priceIncreasePerOwned = item.repeatablePricing?.priceIncreasePipsPerOwned ?? 0;
  return item.pricePips + normalizedOwnedQuantity * priceIncreasePerOwned;
};

export const itemRequiresOwnership = (
  item: DiceShopItem,
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): boolean => {
  return item.requiresItemId ? !hasOwnedItem(ownedQuantities, item.requiresItemId) : false;
};

export const getBadLuckUmbrellaShieldMagnitude = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  if (!hasOwnedItem(ownedQuantities, umbrellaHarnessItemId)) {
    return 1;
  }

  const effect = getPassiveItemEffect(umbrellaHarnessItemId, "passive-extra-shield-on-umbrella");
  return Math.max(1, 1 + (effect?.extraCharges ?? 0));
};

export const getCleanseSaltShieldCharges = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  if (!hasOwnedItem(ownedQuantities, cleanRoomKitItemId)) {
    return 0;
  }

  const effect = getPassiveItemEffect(
    cleanRoomKitItemId,
    "passive-cleanse-grants-negative-effect-shield",
  );
  return effect?.charges ?? 0;
};

export const getGardenSlotCount = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  if (!hasOwnedItem(ownedQuantities, seedSatchelItemId)) {
    return 0;
  }

  const effect = getPassiveItemEffect(seedSatchelItemId, "passive-garden-unlock");
  return effect?.slotCount ?? 0;
};

export const applyPvpLoserLockoutReduction = (
  durationMs: number,
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  if (!hasOwnedItem(ownedQuantities, paddedBracersItemId)) {
    return durationMs;
  }

  const effect = getPassiveItemEffect(paddedBracersItemId, "passive-pvp-loser-lockout-reduction");
  if (!effect) {
    return durationMs;
  }

  const reducedDurationMs = Math.floor(durationMs * (1 - effect.reductionPercent));
  return Math.max(effect.minimumMinutes * minuteMs, reducedDurationMs);
};

export const getExtraBanSlots = (ownedQuantities: ReadonlyMap<DiceShopItemId, number>): number => {
  const effect = getPassiveItemEffect(blacklistLedgerItemId, "passive-extra-ban-slot");
  return getOwnedCopies(ownedQuantities, blacklistLedgerItemId) * (effect?.extraSlots ?? 0);
};

export const getPipRewardBonusPercent = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  const effect = getPassiveItemEffect(pipMagnetItemId, "passive-pip-reward-bonus");
  return getOwnedCopies(ownedQuantities, pipMagnetItemId) * (effect?.bonusPercent ?? 0);
};

export const applyPipRewardBonus = (
  baseRewardPips: number,
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): number => {
  const normalizedBaseReward = Math.max(0, Math.floor(baseRewardPips));
  if (normalizedBaseReward < 1) {
    return 0;
  }

  const totalBonusPercent = getPipRewardBonusPercent(ownedQuantities);
  return normalizedBaseReward + Math.floor((normalizedBaseReward * totalBonusPercent) / 100);
};

export const getPersonalChargeBonus = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): DicePersonalChargeBonus => {
  const unlockEffect = getPassiveItemEffect(idleDynamoItemId, "passive-personal-charge-unlock");
  if (!unlockEffect || !hasOwnedItem(ownedQuantities, idleDynamoItemId)) {
    return {
      unlocked: false,
      minutesPerMultiplier: 0,
      speedMultiplier: 1,
      maxMultiplier: 1,
    };
  }

  const speedEffect = getPassiveItemEffect(
    starterCoilItemId,
    "passive-personal-charge-speed-bonus",
  );
  const capEffect = getPassiveItemEffect(capacitorBankItemId, "passive-personal-charge-cap-bonus");
  const speedCopies = getOwnedCopies(ownedQuantities, starterCoilItemId);
  const capCopies = getOwnedCopies(ownedQuantities, capacitorBankItemId);
  const speedMultiplier = 1 + (speedEffect?.fasterPercent ?? 0) * speedCopies;

  return {
    unlocked: true,
    minutesPerMultiplier: unlockEffect.minutesPerMultiplier / Math.max(1, speedMultiplier),
    speedMultiplier,
    maxMultiplier: unlockEffect.maxMultiplier + (capEffect?.extraMaxMultiplier ?? 0) * capCopies,
  };
};

export const getPermanentBonuses = (
  ownedQuantities: ReadonlyMap<DiceShopItemId, number>,
): DicePermanentBonuses => {
  return {
    extraBanSlots: getExtraBanSlots(ownedQuantities),
    pipRewardBonusPercent: getPipRewardBonusPercent(ownedQuantities),
    personalCharge: getPersonalChargeBonus(ownedQuantities),
  };
};
