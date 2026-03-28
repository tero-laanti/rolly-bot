import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import type { ContractsGameplayProgressPort } from "../../../contracts/application/ports";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { AchievementAnnouncement } from "../../../progression/application/achievement-announcements";
import type { DiceCasinoAnalyticsRepository } from "../ports";
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import type {
  DiceCasinoGame,
  DiceCasinoSession,
  ExactRollHighLowChoice,
  ExactRollMode,
} from "../../domain/casino-session";

export type DiceCasinoBetAdjustment = "min" | "max" | "-10" | "-1" | "+1" | "+10";

type DiceCasinoActionTarget = {
  ownerId: string;
  sessionToken?: string;
};

export type DiceCasinoAction =
  | ({
      type: "refresh";
    } & DiceCasinoActionTarget)
  | ({
      type: "go-lobby";
    } & DiceCasinoActionTarget)
  | ({
      type: "show-rules";
    } & DiceCasinoActionTarget)
  | ({
      type: "back";
    } & DiceCasinoActionTarget)
  | ({
      type: "resume-round";
    } & DiceCasinoActionTarget)
  | ({
      type: "play-again";
    } & DiceCasinoActionTarget)
  | ({
      type: "select-game";
      game: DiceCasinoGame;
    } & DiceCasinoActionTarget)
  | ({
      type: "adjust-bet";
      adjustment: DiceCasinoBetAdjustment;
    } & DiceCasinoActionTarget)
  | ({
      type: "play";
    } & DiceCasinoActionTarget)
  | ({
      type: "exact-mode";
      mode: ExactRollMode;
    } & DiceCasinoActionTarget)
  | ({
      type: "exact-face";
      face: number;
    } & DiceCasinoActionTarget)
  | ({
      type: "exact-high-low";
      choice: ExactRollHighLowChoice;
    } & DiceCasinoActionTarget)
  | ({
      type: "push-roll";
    } & DiceCasinoActionTarget)
  | ({
      type: "push-cashout";
    } & DiceCasinoActionTarget)
  | ({
      type: "blackjack-hit";
    } & DiceCasinoActionTarget)
  | ({
      type: "blackjack-stand";
    } & DiceCasinoActionTarget)
  | ({
      type: "poker-toggle-hold";
      index: number;
    } & DiceCasinoActionTarget)
  | ({
      type: "poker-reroll";
    } & DiceCasinoActionTarget)
  | ({
      type: "poker-cancel";
    } & DiceCasinoActionTarget);

export type DiceCasinoResult = ActionResult<DiceCasinoAction> & {
  achievementAnnouncements?: AchievementAnnouncement[];
};

export type DiceCasinoActionRow = ActionView<DiceCasinoAction>["components"][number];
export type DiceCasinoActionRows = ActionView<DiceCasinoAction>["components"];

export type MutateSessionResult =
  | {
      kind: "view";
      session: DiceCasinoSession;
      pips: number;
      achievementAnnouncements?: AchievementAnnouncement[];
    }
  | {
      kind: "reply";
      content: string;
      ephemeral: boolean;
      achievementAnnouncements?: AchievementAnnouncement[];
    }
  | {
      kind: "expired";
    }
  | {
      kind: "replaced";
    };

export type DiceCasinoMutationContext = {
  analytics: DiceCasinoAnalyticsRepository;
  contracts?: Pick<ContractsGameplayProgressPort, "recordCasinoGameCompletion">;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getPips" | "grantRewardPips">;
  nowMs: number;
  progression: Pick<DiceProgressionRepository, "awardAchievements">;
  session: DiceCasinoSession;
  pips: number;
};

export type DiceCasinoGameViewContext = {
  session: DiceCasinoSession;
  pips: number;
  hasAffordableBet: boolean;
  roundActive: boolean;
};

export type DiceCasinoGameModule = {
  game: DiceCasinoGame;
  startRound: (context: DiceCasinoMutationContext) => MutateSessionResult;
  handleAction: (
    context: DiceCasinoMutationContext,
    action: DiceCasinoAction,
  ) => MutateSessionResult | null;
  buildDescriptionLines: (session: DiceCasinoSession) => string[];
  buildComponentRows: (context: DiceCasinoGameViewContext) => DiceCasinoActionRows;
};
