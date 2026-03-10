import { getDiceAchievement, getPrestigeAchievementId } from "../../../progression/domain/achievements";
import type { DiceAnalyticsRepository } from "../../../analytics/application/ports";
import {
  getDicePrestigeBaseLevel,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "../../../progression/domain/game-rules";
import type { DiceProgressionRepository } from "../ports";
import type {
  ActionButtonSpec,
  ActionResult,
  ActionView,
} from "../../../../shared-kernel/application/action-view";
import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";

const prestigeButtonsPerRow = 5;

type PrestigeState = {
  activePrestige: number;
  highestPrestige: number;
  activeLevel: number;
  canPrestigeUp: boolean;
};

export type DicePrestigeAction =
  | {
      type: "choose";
      ownerId: string;
    }
  | {
      type: "back";
      ownerId: string;
    }
  | {
      type: "set";
      ownerId: string;
      prestige: number;
    }
  | {
      type: "up";
      ownerId: string;
    };

export type DicePrestigeResult = ActionResult<DicePrestigeAction>;

type ManagePrestigeDependencies = {
  analytics: Pick<
    DiceAnalyticsRepository,
    "resetDiceLevelAnalyticsProgress" | "resetDicePrestigeAnalyticsProgress"
  >;
  progression: Pick<
    DiceProgressionRepository,
    | "awardAchievements"
    | "getActiveDicePrestige"
    | "getDiceLevel"
    | "getDicePrestige"
    | "setActiveDicePrestige"
    | "setDiceLevelForPrestige"
    | "setDicePrestige"
  >;
  unitOfWork: UnitOfWork;
};

export const createDicePrestigeUseCase = ({
  analytics,
  progression,
  unitOfWork,
}: ManagePrestigeDependencies) => {
  const createDicePrestigeReply = (userId: string): DicePrestigeResult => {
    const state = getPrestigeState(progression, userId);
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildMainView(userId, state),
        ephemeral: false,
      },
    };
  };

  const handleDicePrestigeAction = (
    actorId: string,
    action: DicePrestigeAction,
  ): DicePrestigeResult => {
    if (actorId !== action.ownerId) {
      return {
        kind: "reply",
        payload: {
          type: "message",
          content: "This prestige menu is not assigned to you.",
          ephemeral: true,
        },
      };
    }

    if (action.type === "choose") {
      const state = getPrestigeState(progression, action.ownerId);
      return {
        kind: "update",
        payload: {
          type: "view",
          view: buildSelectView(action.ownerId, state),
        },
      };
    }

    if (action.type === "back") {
      const state = getPrestigeState(progression, action.ownerId);
      return {
        kind: "update",
        payload: {
          type: "view",
          view: buildMainView(action.ownerId, state),
        },
      };
    }

    if (action.type === "set") {
      if (!Number.isInteger(action.prestige) || action.prestige < 0) {
        return {
          kind: "reply",
          payload: {
            type: "message",
            content: "Invalid prestige selection.",
            ephemeral: true,
          },
        };
      }

      const highestPrestige = progression.getDicePrestige(action.ownerId);
      if (action.prestige > highestPrestige) {
        return {
          kind: "reply",
          payload: {
            type: "message",
            content: "You have not unlocked that prestige level.",
            ephemeral: true,
          },
        };
      }

      progression.setActiveDicePrestige({
        userId: action.ownerId,
        prestige: action.prestige,
      });
      analytics.resetDiceLevelAnalyticsProgress(action.ownerId);

      const state = getPrestigeState(progression, action.ownerId);
      return {
        kind: "update",
        payload: {
          type: "view",
          view: buildMainView(action.ownerId, state),
        },
      };
    }

    const state = getPrestigeState(progression, action.ownerId);
    if (!state.canPrestigeUp) {
      return {
        kind: "update",
        payload: {
          type: "view",
          view: buildMainView(action.ownerId, state),
        },
      };
    }

    const nextPrestige = state.highestPrestige + 1;
    const newlyEarned = unitOfWork.runInTransaction(() => {
      progression.setDicePrestige({ userId: action.ownerId, prestige: nextPrestige });
      progression.setActiveDicePrestige({ userId: action.ownerId, prestige: nextPrestige });
      progression.setDiceLevelForPrestige({
        userId: action.ownerId,
        prestige: nextPrestige,
        level: 1,
      });
      analytics.resetDicePrestigeAnalyticsProgress(action.ownerId);

      const achievementId = getPrestigeAchievementId(nextPrestige);
      if (!achievementId) {
        return [];
      }

      return progression.awardAchievements(action.ownerId, [achievementId]);
    });

    const refreshed = getPrestigeState(progression, action.ownerId);
    const achievementText =
      newlyEarned.length > 0
        ? `\nAchievement unlocked: ${newlyEarned.map((id) => getDiceAchievement(id)?.name ?? id).join(", ")}.`
        : "";

    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildMainView(
          action.ownerId,
          refreshed,
          `Prestige complete. Your active die is now d${getDiceSidesForPrestige(nextPrestige)} and prestige ${nextPrestige} starts at level 1.${achievementText}`,
        ),
      },
    };
  };

  return {
    createDicePrestigeReply,
    handleDicePrestigeAction,
  };
};

const getPrestigeState = (
  progression: Pick<
    DiceProgressionRepository,
    "getActiveDicePrestige" | "getDiceLevel" | "getDicePrestige"
  >,
  userId: string,
): PrestigeState => {
  const highestPrestige = progression.getDicePrestige(userId);
  const activePrestige = progression.getActiveDicePrestige(userId);
  const activeLevel = progression.getDiceLevel(userId);
  const maxDicePrestige = getMaxDicePrestige();
  const canPrestigeUp =
    activePrestige === highestPrestige &&
    highestPrestige < maxDicePrestige &&
    activeLevel >= getDicePrestigeBaseLevel();

  return {
    activePrestige,
    highestPrestige,
    activeLevel,
    canPrestigeUp,
  };
};

const buildMainView = (
  userId: string,
  state: PrestigeState,
  announcement?: string,
): ActionView<DicePrestigeAction> => {
  const sections = [announcement, buildMainContent(userId, state)].filter(
    (section): section is string => Boolean(section),
  );

  return {
    content: sections.join("\n\n"),
    components: [
      [
        {
          action: { type: "up", ownerId: userId },
          label: "Prestige up",
          style: "success",
          disabled: !state.canPrestigeUp,
        },
        {
          action: { type: "choose", ownerId: userId },
          label: "Choose prestige",
          style: "primary",
        },
      ],
    ],
  };
};

const buildSelectView = (
  userId: string,
  state: PrestigeState,
): ActionView<DicePrestigeAction> => {
  const levelButtons: ActionButtonSpec<DicePrestigeAction>[] = Array.from(
    { length: state.highestPrestige + 1 },
    (_, index) => {
      const prestige = index;
      const isSelected = prestige === state.activePrestige;
      return {
        action: { type: "set", ownerId: userId, prestige },
        label: isSelected ? `P${prestige} (Active)` : `P${prestige}`,
        style: isSelected ? ("success" as const) : ("primary" as const),
        disabled: isSelected,
      };
    },
  );

  const rows: ActionView<DicePrestigeAction>["components"] = [];
  for (let index = 0; index < levelButtons.length; index += prestigeButtonsPerRow) {
    rows.push(levelButtons.slice(index, index + prestigeButtonsPerRow));
  }

  rows.push([
    {
      action: { type: "back", ownerId: userId },
      label: "Back",
      style: "secondary",
    },
  ]);

  return {
    content: buildSelectContent(userId, state),
    components: rows,
  };
};

const buildMainContent = (userId: string, state: PrestigeState): string => {
  const nextPrestige = state.highestPrestige + 1;
  const maxDicePrestige = getMaxDicePrestige();
  const requirementLine =
    state.highestPrestige >= maxDicePrestige
      ? "Maximum prestige reached."
      : state.activePrestige !== state.highestPrestige
        ? `Prestige up unavailable. Select prestige ${state.highestPrestige} to continue progression.`
        : state.activeLevel >= getDicePrestigeBaseLevel()
          ? `Prestige up available: ${state.highestPrestige} -> ${nextPrestige} (d${getDiceSidesForPrestige(nextPrestige)}).`
          : `Prestige up requires level ${getDicePrestigeBaseLevel()} on prestige ${state.highestPrestige}.`;

  return [
    `Dice prestige for <@${userId}>:`,
    `Active prestige: ${state.activePrestige} (d${getDiceSidesForPrestige(state.activePrestige)}), level ${state.activeLevel}.`,
    `Highest unlocked prestige: ${state.highestPrestige} (d${getDiceSidesForPrestige(state.highestPrestige)}).`,
    requirementLine,
  ].join("\n");
};

const buildSelectContent = (userId: string, state: PrestigeState): string => {
  return [
    `Choose active prestige for <@${userId}>.`,
    `Current: ${state.activePrestige} (d${getDiceSidesForPrestige(state.activePrestige)}), level ${state.activeLevel}.`,
    `Unlocked range: 0-${state.highestPrestige}.`,
  ].join("\n");
};
