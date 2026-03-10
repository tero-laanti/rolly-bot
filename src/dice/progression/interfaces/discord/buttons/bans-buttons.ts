import type { DiceBansAction } from "../../../application/manage-bans/use-case";

export const diceBansButtonPrefix = "dice-bans:";

export const encodeDiceBansAction = (action: DiceBansAction): string => {
  if (action.type === "back") {
    return `${diceBansButtonPrefix}back:${action.ownerId}`;
  }

  if (action.type === "close") {
    return `${diceBansButtonPrefix}close:${action.ownerId}`;
  }

  if (action.type === "clear-bans") {
    return `${diceBansButtonPrefix}clear-bans:${action.ownerId}`;
  }

  if (action.type === "die") {
    return `${diceBansButtonPrefix}die:${action.ownerId}:${action.dieIndex}`;
  }

  if (action.type === "page") {
    return `${diceBansButtonPrefix}page:${action.ownerId}:${action.dieIndex}:${action.page}`;
  }

  return `${diceBansButtonPrefix}ban:${action.ownerId}:${action.dieIndex}:${action.value}:${action.page}`;
};

export const parseDiceBansAction = (customId: string): DiceBansAction | null => {
  const [prefix, action, ownerId, dieIndexRaw, valueRaw, pageRaw] = customId.split(":");
  if (prefix !== diceBansButtonPrefix.slice(0, -1) || !ownerId) {
    return null;
  }

  if (action === "back") {
    return { type: "back", ownerId };
  }

  if (action === "close") {
    return { type: "close", ownerId };
  }

  if (action === "clear-bans") {
    return { type: "clear-bans", ownerId };
  }

  const dieIndex = Number.parseInt(dieIndexRaw ?? "", 10);
  if (!Number.isInteger(dieIndex)) {
    return null;
  }

  if (action === "die") {
    return { type: "die", ownerId, dieIndex };
  }

  if (action === "page") {
    const page = Number.parseInt(valueRaw ?? "", 10);
    if (!Number.isInteger(page)) {
      return null;
    }

    return { type: "page", ownerId, dieIndex, page };
  }

  if (action !== "ban") {
    return null;
  }

  const value = Number.parseInt(valueRaw ?? "", 10);
  const page = Number.parseInt(pageRaw ?? "", 10);
  if (!Number.isInteger(value) || !Number.isInteger(page)) {
    return null;
  }

  return {
    type: "ban",
    ownerId,
    dieIndex,
    value,
    page,
  };
};
