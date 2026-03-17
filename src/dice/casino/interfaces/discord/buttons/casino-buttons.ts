import type { DiceCasinoAction } from "../../../application/manage-casino/use-case";
import { getExactRollDieSides } from "../../../domain/game-rules";

export const diceCasinoButtonPrefix = "dice-casino:";

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
      return `${diceCasinoButtonPrefix}${action.type}:${action.ownerId}`;
    case "select-game":
      return `${diceCasinoButtonPrefix}${action.type}:${action.ownerId}:${action.game}`;
    case "adjust-bet":
      return `${diceCasinoButtonPrefix}${action.type}:${action.ownerId}:${action.adjustment}`;
    case "exact-mode":
      return `${diceCasinoButtonPrefix}${action.type}:${action.ownerId}:${action.mode}`;
    case "exact-face":
      return `${diceCasinoButtonPrefix}${action.type}:${action.ownerId}:${action.face}`;
    case "exact-high-low":
      return `${diceCasinoButtonPrefix}${action.type}:${action.ownerId}:${action.choice}`;
    case "poker-toggle-hold":
      return `${diceCasinoButtonPrefix}${action.type}:${action.ownerId}:${action.index}`;
  }
};

export const parseDiceCasinoAction = (customId: string): DiceCasinoAction | null => {
  const [prefix, action, ownerId, arg] = customId.split(":");
  if (prefix !== diceCasinoButtonPrefix.slice(0, -1) || !action || !ownerId) {
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
    return { type: action, ownerId };
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
      ownerId,
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
      ownerId,
      adjustment: arg,
    };
  }

  if (action === "exact-mode" && (arg === "exact-face" || arg === "high-low")) {
    return {
      type: "exact-mode",
      ownerId,
      mode: arg,
    };
  }

  if (action === "exact-face") {
    const face = Number.parseInt(arg ?? "", 10);
    if (!Number.isInteger(face) || face < 1 || face > getExactRollDieSides()) {
      return null;
    }

    return {
      type: "exact-face",
      ownerId,
      face,
    };
  }

  if (action === "exact-high-low" && (arg === "low" || arg === "high")) {
    return {
      type: "exact-high-low",
      ownerId,
      choice: arg,
    };
  }

  if (action === "poker-toggle-hold") {
    const index = Number.parseInt(arg ?? "", 10);
    if (!Number.isInteger(index)) {
      return null;
    }

    return {
      type: "poker-toggle-hold",
      ownerId,
      index,
    };
  }

  return null;
};
