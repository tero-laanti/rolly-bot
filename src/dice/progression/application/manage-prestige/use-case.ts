import { getPrestigeAchievementId } from "../../../progression/domain/achievements";
import type { DiceAnalyticsRepository } from "../../../analytics/application/ports";
import {
  getDicePrestigeBaseDiceCount,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "../../../progression/domain/game-rules";
import type { DiceProgressionRepository } from "../ports";
import type {
  ActionButtonSpec,
  ActionResult,
  ActionView,
} from "../../../../shared-kernel/application/action-view";
import { chunkActionButtons } from "../../../../shared-kernel/application/action-view";
import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import {
  createAchievementAnnouncement,
  type AchievementAnnouncement,
} from "../achievement-announcements";

const prestigeButtonsPerRow = 5;

type PrestigeState = {
  activePrestige: number;
  highestPrestige: number;
  activeDiceCount: number;
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

export type DicePrestigeResult = ActionResult<DicePrestigeAction> & {
  achievementAnnouncements?: AchievementAnnouncement[];
};

type ManagePrestigeDependencies = {
  analytics: Pick<DiceAnalyticsRepository, "resetDicePrestigeAnalyticsProgress">;
  progression: Pick<
    DiceProgressionRepository,
    | "awardAchievements"
    | "getActiveDicePrestige"
    | "getDiceCount"
    | "getDicePrestige"
    | "setActiveDicePrestige"
    | "setDiceCountForPrestige"
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
            content: "You have not unlocked that prestige.",
            ephemeral: true,
          },
        };
      }

      progression.setActiveDicePrestige({
        userId: action.ownerId,
        prestige: action.prestige,
      });

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
      progression.setDiceCountForPrestige({
        userId: action.ownerId,
        prestige: nextPrestige,
        diceCount: 1,
      });
      analytics.resetDicePrestigeAnalyticsProgress(action.ownerId);

      const achievementId = getPrestigeAchievementId(nextPrestige);
      if (!achievementId) {
        return [];
      }

      return progression.awardAchievements(action.ownerId, [achievementId]);
    });

    const refreshed = getPrestigeState(progression, action.ownerId);
    const achievementAnnouncement = createAchievementAnnouncement(action.ownerId, newlyEarned);

    return {
      kind: "update",
      achievementAnnouncements: achievementAnnouncement ? [achievementAnnouncement] : [],
      payload: {
        type: "view",
        view: buildMainView(
          action.ownerId,
          refreshed,
          `Prestige complete. Your active die is now d${getDiceSidesForPrestige(nextPrestige)} and prestige ${nextPrestige} starts with 1 die.`,
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
    "getActiveDicePrestige" | "getDiceCount" | "getDicePrestige"
  >,
  userId: string,
): PrestigeState => {
  const highestPrestige = progression.getDicePrestige(userId);
  const activePrestige = progression.getActiveDicePrestige(userId);
  const activeDiceCount = progression.getDiceCount(userId);
  const maxDicePrestige = getMaxDicePrestige();
  const canPrestigeUp =
    activePrestige === highestPrestige &&
    highestPrestige < maxDicePrestige &&
    activeDiceCount >= getDicePrestigeBaseDiceCount();

  return {
    activePrestige,
    highestPrestige,
    activeDiceCount,
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

const buildSelectView = (userId: string, state: PrestigeState): ActionView<DicePrestigeAction> => {
  const prestigeButtons: ActionButtonSpec<DicePrestigeAction>[] = Array.from(
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

  const rows = chunkActionButtons(prestigeButtons, prestigeButtonsPerRow);

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
        : state.activeDiceCount >= getDicePrestigeBaseDiceCount()
          ? `Prestige up available: ${state.highestPrestige} -> ${nextPrestige} (d${getDiceSidesForPrestige(nextPrestige)}).`
          : `Prestige up requires ${getDicePrestigeBaseDiceCount()} dice on prestige ${state.highestPrestige}.`;

  return [
    `Dice prestige for <@${userId}>:`,
    `Active prestige: ${state.activePrestige} (d${getDiceSidesForPrestige(state.activePrestige)}), dice: ${state.activeDiceCount}.`,
    `Highest unlocked prestige: ${state.highestPrestige} (d${getDiceSidesForPrestige(state.highestPrestige)}).`,
    requirementLine,
  ].join("\n");
};

const buildSelectContent = (userId: string, state: PrestigeState): string => {
  return [
    `Choose active prestige for <@${userId}>.`,
    `Current: ${state.activePrestige} (d${getDiceSidesForPrestige(state.activePrestige)}), dice: ${state.activeDiceCount}.`,
    `Unlocked range: 0-${state.highestPrestige}.`,
  ].join("\n");
};
