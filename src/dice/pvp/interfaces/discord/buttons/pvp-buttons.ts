import type { DicePvpAction } from "../../../application/manage-challenge/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

const openOpponentToken = "any";

export const dicePvpButtonPrefix = "dice-pvp:";

export const encodeDicePvpAction = (action: DicePvpAction): string => {
  if (action.type === "pick") {
    return encodeActionId(
      dicePvpButtonPrefix,
      "pick",
      action.ownerId,
      action.opponentId ?? openOpponentToken,
      action.duelTier,
    );
  }

  return encodeActionId(dicePvpButtonPrefix, action.type, action.challengeId);
};

export const parseDicePvpAction = (customId: string): DicePvpAction | null => {
  const parsed = parseActionId(customId, dicePvpButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, firstPart, secondPart, thirdPart] = parsed;

  if ((action === "accept" || action === "decline") && firstPart) {
    return {
      type: action,
      challengeId: firstPart,
    };
  }

  if (action !== "pick" || !firstPart || !secondPart) {
    return null;
  }

  const duelTier = Number.parseInt(thirdPart ?? "", 10);
  if (!Number.isInteger(duelTier)) {
    return null;
  }

  return {
    type: "pick",
    ownerId: firstPart,
    opponentId: secondPart === openOpponentToken ? null : secondPart,
    duelTier,
  };
};
