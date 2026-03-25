import {
  getDicePrestigeBaseDiceCount,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "./game-rules";

export type DiceCountUpdate = {
  userId: string;
  diceCount: number;
};

export type DiceCountByPrestigeUpdate = {
  userId: string;
  prestige: number;
  diceCount: number;
};

export type DicePrestigeUpdate = {
  userId: string;
  prestige: number;
};

export type DiceActivePrestigeUpdate = {
  userId: string;
  prestige: number;
};

export const normalizeDicePrestige = (prestige: number): number => {
  return Math.min(getMaxDicePrestige(), Math.max(0, Math.floor(prestige)));
};

export const normalizeActiveDicePrestige = (prestige: number, highestPrestige: number): number => {
  return Math.min(normalizeDicePrestige(highestPrestige), normalizeDicePrestige(prestige));
};

export const normalizeDiceCount = (diceCount: number): number => {
  return Math.max(1, Math.floor(diceCount));
};

export const shouldUsePrestigeBaseDiceCount = (
  prestige: number,
  highestPrestige: number,
): boolean => {
  return normalizeDicePrestige(prestige) < normalizeDicePrestige(highestPrestige);
};

export const getInitialDiceCountForPrestige = (
  prestige: number,
  highestPrestige: number,
): number => {
  return shouldUsePrestigeBaseDiceCount(prestige, highestPrestige)
    ? getDicePrestigeBaseDiceCount()
    : 1;
};

export const getDiceSidesForActivePrestige = (prestige: number): number => {
  return getDiceSidesForPrestige(normalizeDicePrestige(prestige));
};
