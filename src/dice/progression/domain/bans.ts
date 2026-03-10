import { getMaxBansPerDie, getUnlockedBanSlotsFromFame } from "./game-rules";

export const rollDieWithBans = (bannedValues: Set<number> | null, dieSides: number): number => {
  const options: number[] = [];
  for (let value = 1; value <= dieSides; value += 1) {
    if (!bannedValues || !bannedValues.has(value)) {
      options.push(value);
    }
  }

  if (options.length === 0) {
    return Math.floor(Math.random() * dieSides) + 1;
  }

  const index = Math.floor(Math.random() * options.length);
  return options[index] ?? 1;
};

export { getMaxBansPerDie, getUnlockedBanSlotsFromFame };
