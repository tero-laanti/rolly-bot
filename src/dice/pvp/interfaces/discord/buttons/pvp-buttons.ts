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
      action.wagerPips,
    );
  }

  return encodeActionId(dicePvpButtonPrefix, action.type, action.challengeId);
};

export const parseDicePvpAction = (customId: string): DicePvpAction | null => {
  const parsed = parseActionId(customId, dicePvpButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, firstPart, secondPart, thirdPart, fourthPart] = parsed;

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
  const wagerPips = Number.parseInt(fourthPart ?? "0", 10);
  if (!Number.isInteger(duelTier) || !Number.isInteger(wagerPips)) {
    return null;
  }

  return {
    type: "pick",
    ownerId: firstPart,
    opponentId: secondPart === openOpponentToken ? null : secondPart,
    duelTier,
    wagerPips,
  };
};
