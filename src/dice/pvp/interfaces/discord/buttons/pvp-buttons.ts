import type { DicePvpAction } from "../../../application/manage-challenge/use-case";

const openOpponentToken = "any";

export const dicePvpButtonPrefix = "dice-pvp:";

export const encodeDicePvpAction = (action: DicePvpAction): string => {
  if (action.type === "pick") {
    return `${dicePvpButtonPrefix}pick:${action.ownerId}:${action.opponentId ?? openOpponentToken}:${action.duelTier}`;
  }

  return `${dicePvpButtonPrefix}${action.type}:${action.challengeId}`;
};

export const parseDicePvpAction = (customId: string): DicePvpAction | null => {
  const [prefix, action, firstPart, secondPart, thirdPart] = customId.split(":");
  if (prefix !== dicePvpButtonPrefix.slice(0, -1)) {
    return null;
  }

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
