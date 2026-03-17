import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceCasinoAnalyticsRepository } from "../ports";
import type {
  DiceCasinoGame,
  DiceCasinoSession,
  ExactRollHighLowChoice,
  ExactRollMode,
} from "../../domain/casino-session";

export type DiceCasinoBetAdjustment = "min" | "max" | "-10" | "-1" | "+1" | "+10";

export type DiceCasinoAction =
  | {
      type: "refresh";
      ownerId: string;
    }
  | {
      type: "select-game";
      ownerId: string;
      game: DiceCasinoGame;
    }
  | {
      type: "adjust-bet";
      ownerId: string;
      adjustment: DiceCasinoBetAdjustment;
    }
  | {
      type: "play";
      ownerId: string;
    }
  | {
      type: "exact-mode";
      ownerId: string;
      mode: ExactRollMode;
    }
  | {
      type: "exact-face";
      ownerId: string;
      face: number;
    }
  | {
      type: "exact-high-low";
      ownerId: string;
      choice: ExactRollHighLowChoice;
    }
  | {
      type: "push-roll";
      ownerId: string;
    }
  | {
      type: "push-cashout";
      ownerId: string;
    }
  | {
      type: "blackjack-hit";
      ownerId: string;
    }
  | {
      type: "blackjack-stand";
      ownerId: string;
    }
  | {
      type: "poker-toggle-hold";
      ownerId: string;
      index: number;
    }
  | {
      type: "poker-reroll";
      ownerId: string;
    }
  | {
      type: "poker-cancel";
      ownerId: string;
    };

export type DiceCasinoResult = ActionResult<DiceCasinoAction>;

export type DiceCasinoActionRow = ActionView<DiceCasinoAction>["components"][number];
export type DiceCasinoActionRows = ActionView<DiceCasinoAction>["components"];

export type MutateSessionResult =
  | {
      kind: "view";
      session: DiceCasinoSession;
      pips: number;
    }
  | {
      kind: "reply";
      content: string;
      ephemeral: boolean;
    }
  | {
      kind: "expired";
    };

export type DiceCasinoMutationContext = {
  analytics: DiceCasinoAnalyticsRepository;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getPips">;
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
