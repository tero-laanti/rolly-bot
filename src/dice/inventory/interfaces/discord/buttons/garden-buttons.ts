import type { DiceGardenAction } from "../../../application/manage-garden/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceGardenButtonPrefix = "dice-garden:";

export const encodeDiceGardenAction = (action: DiceGardenAction): string => {
  return encodeActionId(diceGardenButtonPrefix, action.type, action.ownerId);
};

export const parseDiceGardenAction = (customId: string): DiceGardenAction | null => {
  const parsed = parseActionId(customId, diceGardenButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId] = parsed;
  if (!ownerId) {
    return null;
  }

  if (action === "refresh" || action === "plant" || action === "harvest") {
    return {
      type: action,
      ownerId,
    };
  }

  return null;
};
