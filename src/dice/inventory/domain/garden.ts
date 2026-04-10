import type { DiceShopItem } from "./shop";

export type GardenDieSides = 4 | 6 | 8 | 10 | 12;

export type DiceGardenSeedOutcome = {
  sides: GardenDieSides;
  weight: number;
};

export const isGardenSeedItem = (item: DiceShopItem): boolean => item.effect.type === "garden-seed";

export const getGardenGrowDurationHours = (sides: GardenDieSides): number => sides;

export const getGardenBaseRewardPips = (sides: GardenDieSides): number => {
  return (sides * (sides + 1)) / 2;
};

export const getGardenGrowDurationMs = (sides: GardenDieSides): number => {
  return getGardenGrowDurationHours(sides) * 60 * 60 * 1000;
};

export const rollGardenSeedOutcome = (
  outcomes: readonly DiceGardenSeedOutcome[],
  randomValue: number = Math.random(),
): DiceGardenSeedOutcome => {
  if (outcomes.length < 1) {
    throw new Error("Garden seed outcomes are required.");
  }

  const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  if (totalWeight < 1) {
    throw new Error("Garden seed outcomes must have a positive total weight.");
  }

  let remaining = Math.max(0, Math.min(randomValue, 0.999999999)) * totalWeight;
  for (const outcome of outcomes) {
    if (remaining < outcome.weight) {
      return outcome;
    }

    remaining -= outcome.weight;
  }

  return outcomes[outcomes.length - 1] as DiceGardenSeedOutcome;
};
