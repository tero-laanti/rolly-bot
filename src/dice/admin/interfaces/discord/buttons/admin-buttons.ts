import type { DiceAdminAction } from "../../../application/manage-admin/use-case";

export const diceAdminButtonPrefix = "dice-admin:";

export const encodeDiceAdminAction = (action: DiceAdminAction): string => {
  return `${diceAdminButtonPrefix}${action.type}:${action.ownerId}:${action.targetUserId}`;
};

export const parseDiceAdminAction = (customId: string): DiceAdminAction | null => {
  const [prefix, action, ownerId, targetUserId] = customId.split(":");
  if (prefix !== diceAdminButtonPrefix.slice(0, -1) || !ownerId || !targetUserId) {
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
