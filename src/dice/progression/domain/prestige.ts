import {
  getDicePrestigeBaseLevel,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "./game-rules";

export type DiceLevelUpdate = {
  userId: string;
  level: number;
};

export type DiceLevelByPrestigeUpdate = {
  userId: string;
  prestige: number;
  level: number;
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

export const normalizeActiveDicePrestige = (
  prestige: number,
  highestPrestige: number,
): number => {
  return Math.min(normalizeDicePrestige(highestPrestige), normalizeDicePrestige(prestige));
};

export const normalizeDiceLevel = (level: number): number => {
  return Math.max(1, Math.floor(level));
};

export const shouldUsePrestigeBaseLevel = (prestige: number, highestPrestige: number): boolean => {
  return normalizeDicePrestige(prestige) < normalizeDicePrestige(highestPrestige);
};

export const getInitialDiceLevelForPrestige = (
  prestige: number,
  highestPrestige: number,
): number => {
  return shouldUsePrestigeBaseLevel(prestige, highestPrestige) ? getDicePrestigeBaseLevel() : 1;
};

export const getDiceSidesForActivePrestige = (prestige: number): number => {
  return getDiceSidesForPrestige(normalizeDicePrestige(prestige));
};
