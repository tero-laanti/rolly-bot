import type { DiceAdminAction } from "../../../application/manage-admin/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceAdminButtonPrefix = "dice-admin:";

export const encodeDiceAdminAction = (action: DiceAdminAction): string => {
  return encodeActionId(diceAdminButtonPrefix, action.type, action.ownerId, action.targetUserId);
};

export const parseDiceAdminAction = (customId: string): DiceAdminAction | null => {
  const parsed = parseActionId(customId, diceAdminButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId, targetUserId] = parsed;
  if (!ownerId || !targetUserId) {
    return null;
  }

  if (
    action !== "menu" &&
    action !== "status" &&
    action !== "event-trigger" &&
    action !== "effects-user" &&
    action !== "effects-clear"
  ) {
    return null;
  }

  return {
    type: action,
    ownerId,
    targetUserId,
  };
};
