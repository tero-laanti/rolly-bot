import type { DicePrestigeAction } from "../../../application/manage-prestige/use-case";

export const dicePrestigeButtonPrefix = "dice-prestige:";

export const encodeDicePrestigeAction = (action: DicePrestigeAction): string => {
  if (action.type === "choose") {
    return `${dicePrestigeButtonPrefix}choose:${action.ownerId}`;
  }

  if (action.type === "back") {
    return `${dicePrestigeButtonPrefix}back:${action.ownerId}`;
  }

  if (action.type === "set") {
    return `${dicePrestigeButtonPrefix}set:${action.ownerId}:${action.prestige}`;
  }

  return `${dicePrestigeButtonPrefix}up:${action.ownerId}`;
};

export const parseDicePrestigeAction = (customId: string): DicePrestigeAction | null => {
  const [prefix, action, ownerId, prestigeRaw] = customId.split(":");
  if (prefix !== dicePrestigeButtonPrefix.slice(0, -1) || !ownerId) {
    return null;
  }

  if (action === "choose") {
    return { type: "choose", ownerId };
  }

  if (action === "back") {
    return { type: "back", ownerId };
  }

  if (action === "up") {
    return { type: "up", ownerId };
  }

  if (action !== "set") {
    return null;
  }

  const prestige = Number.parseInt(prestigeRaw ?? "", 10);
  if (!Number.isInteger(prestige)) {
    return null;
  }

  return {
    type: "set",
    ownerId,
    prestige,
  };
};
