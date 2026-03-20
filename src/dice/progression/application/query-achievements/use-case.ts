import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import { diceAchievements } from "../../../progression/domain/achievements";
import type { DiceProgressionRepository } from "../ports";

const achievementsPageSize = 15;

export type DiceAchievementsFilter = "all" | "unlocked" | "locked";

export type DiceAchievementsAction =
  | {
      type: "filter-all";
      ownerId: string;
    }
  | {
      type: "filter-unlocked";
      ownerId: string;
    }
  | {
      type: "filter-locked";
      ownerId: string;
    }
  | {
      type: "page";
      ownerId: string;
      filter: DiceAchievementsFilter;
      page: number;
    }
  | {
      type: "close";
      ownerId: string;
    };

export type DiceAchievementsResult = ActionResult<DiceAchievementsAction>;

type QueryDiceAchievementsDependencies = {
  progression: Pick<DiceProgressionRepository, "getUserDiceAchievements">;
};

type AchievementBrowserState = {
  filter: DiceAchievementsFilter;
  page: number;
};

type AchievementBrowserPage = {
  currentPage: number;
  totalPages: number;
  totalAchievements: number;
  earnedCount: number;
  visibleLines: string[];
  filter: DiceAchievementsFilter;
};

export const createQueryDiceAchievementsUseCase = ({
  progression,
}: QueryDiceAchievementsDependencies) => {
  const createDiceAchievementsReply = (userId: string): DiceAchievementsResult => {
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildAchievementsView(progression, userId, {
          filter: "all",
          page: 0,
        }),
        ephemeral: false,
      },
    };
  };

  const handleDiceAchievementsAction = (
    actorId: string,
    action: DiceAchievementsAction,
  ): DiceAchievementsResult => {
    if (actorId !== action.ownerId) {
      return {
        kind: "reply",
        payload: {
          type: "message",
          content: "This achievements browser is not assigned to you.",
          ephemeral: true,
        },
      };
    }

    if (action.type === "close") {
      return {
        kind: "update",
        payload: {
          type: "message",
          content: "Achievements browser closed.",
          clearComponents: true,
        },
      };
    }

    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildAchievementsView(
          progression,
          action.ownerId,
          action.type === "filter-all"
            ? { filter: "all", page: 0 }
            : action.type === "filter-unlocked"
              ? { filter: "unlocked", page: 0 }
              : action.type === "filter-locked"
                ? { filter: "locked", page: 0 }
                : { filter: action.filter, page: action.page },
        ),
      },
    };
  };

  return {
    createDiceAchievementsReply,
    handleDiceAchievementsAction,
  };
};

const buildAchievementsView = (
  progression: Pick<DiceProgressionRepository, "getUserDiceAchievements">,
  userId: string,
  state: AchievementBrowserState,
): ActionView<DiceAchievementsAction> => {
  const page = buildAchievementBrowserPage(progression, userId, state);

  return {
    content: buildAchievementsContent(userId, page),
    components: buildAchievementsComponents(userId, page),
  };
};

const buildAchievementBrowserPage = (
  progression: Pick<DiceProgressionRepository, "getUserDiceAchievements">,
  userId: string,
  state: AchievementBrowserState,
): AchievementBrowserPage => {
  const earnedIds = new Set(progression.getUserDiceAchievements(userId));
  const filteredAchievements = diceAchievements.filter((achievement) => {
    const unlocked = earnedIds.has(achievement.id);
    if (state.filter === "unlocked") {
      return unlocked;
    }

    if (state.filter === "locked") {
      return !unlocked;
    }

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAchievements.length / achievementsPageSize));
  const currentPage = clampPage(state.page, totalPages);
  const startIndex = currentPage * achievementsPageSize;
  const visibleAchievements = filteredAchievements.slice(startIndex, startIndex + achievementsPageSize);
  const visibleLines =
    visibleAchievements.length > 0
      ? visibleAchievements.map((achievement) =>
          earnedIds.has(achievement.id)
            ? `[Unlocked] ${achievement.name}: ${achievement.description}`
            : `[Locked] ${achievement.name}`,
        )
      : ["No achievements on this page."];

  return {
    currentPage,
    totalPages,
    totalAchievements: diceAchievements.length,
    earnedCount: earnedIds.size,
    visibleLines,
    filter: state.filter,
  };
};

const buildAchievementsContent = (userId: string, page: AchievementBrowserPage): string => {
  return [
    `**Dice achievements for <@${userId}>**`,
    `Earned: ${page.earnedCount}/${page.totalAchievements} | Filter: ${formatFilterLabel(page.filter)} | Page: ${page.currentPage + 1}/${page.totalPages}`,
    "",
    ...page.visibleLines,
  ].join("\n");
};

const buildAchievementsComponents = (
  userId: string,
  page: AchievementBrowserPage,
): ActionView<DiceAchievementsAction>["components"] => {
  const hasPreviousPage = page.currentPage > 0;
  const hasNextPage = page.currentPage + 1 < page.totalPages;

  return [
    [
      {
        action: { type: "filter-all", ownerId: userId },
        label: "All",
        style: page.filter === "all" ? "primary" : "secondary",
        disabled: page.filter === "all",
      },
      {
        action: { type: "filter-unlocked", ownerId: userId },
        label: "Unlocked",
        style: page.filter === "unlocked" ? "primary" : "secondary",
        disabled: page.filter === "unlocked",
      },
      {
        action: { type: "filter-locked", ownerId: userId },
        label: "Locked",
        style: page.filter === "locked" ? "primary" : "secondary",
        disabled: page.filter === "locked",
      },
    ],
    [
      {
        action: {
          type: "page",
          ownerId: userId,
          filter: page.filter,
          page: page.currentPage - 1,
        },
        label: "Previous",
        style: "secondary",
        disabled: !hasPreviousPage,
      },
      {
        action: {
          type: "page",
          ownerId: userId,
          filter: page.filter,
          page: page.currentPage + 1,
        },
        label: "Next",
        style: "secondary",
        disabled: !hasNextPage,
      },
      {
        action: { type: "close", ownerId: userId },
        label: "Close",
        style: "danger",
      },
    ],
  ];
};

const clampPage = (page: number, totalPages: number): number => {
  if (!Number.isInteger(page)) {
    return 0;
  }

  return Math.max(0, Math.min(totalPages - 1, page));
};

const formatFilterLabel = (filter: DiceAchievementsFilter): string => {
  switch (filter) {
    case "all":
      return "All";
    case "unlocked":
      return "Unlocked";
    case "locked":
      return "Locked";
  }
};
