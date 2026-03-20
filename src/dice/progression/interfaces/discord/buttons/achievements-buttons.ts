import type {
  DiceAchievementsAction,
  DiceAchievementsFilter,
} from "../../../application/query-achievements/use-case";
import { encodeActionId, parseActionId } from "../../../../../shared-kernel/application/action-id";

export const diceAchievementsButtonPrefix = "dice-achievements:";

export const encodeDiceAchievementsAction = (action: DiceAchievementsAction): string => {
  if (action.type === "filter-all") {
    return encodeActionId(diceAchievementsButtonPrefix, "filter-all", action.ownerId);
  }

  if (action.type === "filter-unlocked") {
    return encodeActionId(diceAchievementsButtonPrefix, "filter-unlocked", action.ownerId);
  }

  if (action.type === "filter-locked") {
    return encodeActionId(diceAchievementsButtonPrefix, "filter-locked", action.ownerId);
  }

  if (action.type === "close") {
    return encodeActionId(diceAchievementsButtonPrefix, "close", action.ownerId);
  }

  return encodeActionId(
    diceAchievementsButtonPrefix,
    "page",
    action.ownerId,
    action.filter,
    action.page,
  );
};

const isAchievementFilter = (value: string): value is DiceAchievementsFilter => {
  return value === "all" || value === "unlocked" || value === "locked";
};

export const parseDiceAchievementsAction = (customId: string): DiceAchievementsAction | null => {
  const parsed = parseActionId(customId, diceAchievementsButtonPrefix);
  if (!parsed) {
    return null;
  }

  const [action, ownerId, filterRaw, pageRaw] = parsed;
  if (!ownerId) {
    return null;
  }

  if (action === "filter-all") {
    return { type: "filter-all", ownerId };
  }

  if (action === "filter-unlocked") {
    return { type: "filter-unlocked", ownerId };
  }

  if (action === "filter-locked") {
    return { type: "filter-locked", ownerId };
  }

  if (action === "close") {
    return { type: "close", ownerId };
  }

  if (action !== "page" || !filterRaw || !isAchievementFilter(filterRaw)) {
    return null;
  }

  const page = Number.parseInt(pageRaw ?? "", 10);
  if (!Number.isInteger(page)) {
    return null;
  }

  return {
    type: "page",
    ownerId,
    filter: filterRaw,
    page,
  };
};
