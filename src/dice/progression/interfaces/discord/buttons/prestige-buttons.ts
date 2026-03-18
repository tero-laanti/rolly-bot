import type { DicePrestigeAction } from "../../../application/manage-prestige/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const dicePrestigeButtonPrefix = "dice-prestige:";

export const encodeDicePrestigeAction = (action: DicePrestigeAction): string => {
  if (action.type === "choose") {
    return encodeActionId(dicePrestigeButtonPrefix, "choose", action.ownerId);
  }

  if (action.type === "back") {
    return encodeActionId(dicePrestigeButtonPrefix, "back", action.ownerId);
  }

  if (action.type === "set") {
    return encodeActionId(dicePrestigeButtonPrefix, "set", action.ownerId, action.prestige);
  }

  return encodeActionId(dicePrestigeButtonPrefix, "up", action.ownerId);
};

export const parseDicePrestigeAction = (customId: string): DicePrestigeAction | null => {
  const parsed = parseActionId(customId, dicePrestigeButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId, prestigeRaw] = parsed;
  if (!ownerId) {
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
