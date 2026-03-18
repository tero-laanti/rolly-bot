import type { DiceCasinoAction } from "../../../application/manage-casino/use-case";
import { getExactRollDieSides } from "../../../domain/game-rules";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceCasinoButtonPrefix = "dice-casino:";

const encodeDiceCasinoTarget = (action: DiceCasinoAction, arg?: string | number): string => {
  const parts: Array<string | number> = [action.type, action.ownerId];

  if (action.sessionToken) {
    parts.push(action.sessionToken);
  }

  if (arg !== undefined) {
    parts.push(arg);
  }

  return encodeActionId(diceCasinoButtonPrefix, ...parts);
};

export const encodeDiceCasinoAction = (action: DiceCasinoAction): string => {
  switch (action.type) {
    case "refresh":
    case "play":
    case "push-roll":
    case "push-cashout":
    case "blackjack-hit":
    case "blackjack-stand":
    case "poker-reroll":
    case "poker-cancel":
      return encodeDiceCasinoTarget(action);
    case "select-game":
      return encodeDiceCasinoTarget(action, action.game);
    case "adjust-bet":
      return encodeDiceCasinoTarget(action, action.adjustment);
    case "exact-mode":
      return encodeDiceCasinoTarget(action, action.mode);
    case "exact-face":
      return encodeDiceCasinoTarget(action, action.face);
    case "exact-high-low":
      return encodeDiceCasinoTarget(action, action.choice);
    case "poker-toggle-hold":
      return encodeDiceCasinoTarget(action, action.index);
  }
};

const parseCasinoActionTarget = (
  ownerId: string,
  maybeSessionToken?: string,
  maybeArg?: string,
): {
  ownerId: string;
  sessionToken?: string;
  arg?: string;
} => {
  if (maybeArg !== undefined) {
    return {
      ownerId,
      sessionToken: maybeSessionToken,
      arg: maybeArg,
    };
  }

  return {
    ownerId,
    arg: maybeSessionToken,
  };
};

export const parseDiceCasinoAction = (customId: string): DiceCasinoAction | null => {
  const parsed = parseActionId(customId, diceCasinoButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId, part4, part5, extra] = parsed;
  if (!action || !ownerId || extra !== undefined) {
    return null;
  }

  if (
    action === "refresh" ||
    action === "play" ||
    action === "push-roll" ||
    action === "push-cashout" ||
    action === "blackjack-hit" ||
    action === "blackjack-stand" ||
    action === "poker-reroll" ||
    action === "poker-cancel"
  ) {
    return part5 === undefined ? { type: action, ownerId, sessionToken: part4 } : null;
  }

  const target = parseCasinoActionTarget(ownerId, part4, part5);
  const arg = target.arg;
  if (!arg) {
    return null;
  }

  if (action === "select-game") {
    if (
      arg !== "exact-roll" &&
      arg !== "push-your-luck" &&
      arg !== "blackjack" &&
      arg !== "dice-poker"
    ) {
      return null;
    }

    return {
      type: "select-game",
      ownerId: target.ownerId,
      sessionToken: target.sessionToken,
      game: arg,
    };
  }

  if (
    action === "adjust-bet" &&
    (arg === "min" ||
      arg === "max" ||
      arg === "-10" ||
      arg === "-1" ||
      arg === "+1" ||
      arg === "+10")
  ) {
    return {
      type: "adjust-bet",
      ownerId: target.ownerId,
      sessionToken: target.sessionToken,
      adjustment: arg,
    };
  }

  if (action === "exact-mode" && (arg === "exact-face" || arg === "high-low")) {
    return {
      type: "exact-mode",
      ownerId: target.ownerId,
      sessionToken: target.sessionToken,
      mode: arg,
    };
  }

  if (action === "exact-face") {
    const face = Number.parseInt(arg, 10);
    if (!Number.isInteger(face) || face < 1 || face > getExactRollDieSides()) {
      return null;
    }

    return {
      type: "exact-face",
      ownerId: target.ownerId,
      sessionToken: target.sessionToken,
      face,
    };
  }

  if (action === "exact-high-low" && (arg === "low" || arg === "high")) {
    return {
      type: "exact-high-low",
      ownerId: target.ownerId,
      sessionToken: target.sessionToken,
      choice: arg,
    };
  }

  if (action === "poker-toggle-hold") {
    const index = Number.parseInt(arg, 10);
    if (!Number.isInteger(index)) {
      return null;
    }

    return {
      type: "poker-toggle-hold",
      ownerId: target.ownerId,
      sessionToken: target.sessionToken,
      index,
    };
  }

  return null;
};
