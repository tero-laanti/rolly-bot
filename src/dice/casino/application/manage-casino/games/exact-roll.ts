import {
  getDiceCasinoBetTier,
  getExactRollFacePayout,
  getExactRollHighLowPayout,
  resolveExactRollFace,
  resolveExactRollHighLow,
  rollDie,
} from "../../../domain/game-rules";
import {
  canStartCasinoRound,
  capitalize,
  getOutcomeFromPayout,
  insufficientPipsReply,
  invalidCasinoAction,
  normalizeSessionBet,
  replyMutation,
  viewMutation,
} from "../helpers";
import type {
  DiceCasinoAction,
  DiceCasinoActionRow,
  DiceCasinoActionRows,
  DiceCasinoGameModule,
  DiceCasinoGameViewContext,
  DiceCasinoMutationContext,
  MutateSessionResult,
} from "../types";

const buildExactRollDescriptionLines = (session: DiceCasinoMutationContext["session"]): string[] => {
  return [
    "**Exact Roll**",
    `Mode: ${session.state.exactRollMode === "exact-face" ? "Exact Face" : "High / Low"}.`,
    `Exact Face total return: floor(59 * bet / 10) = ${getExactRollFacePayout(session.bet)}.`,
    `High / Low total return: floor(197 * bet / 100) = ${getExactRollHighLowPayout(session.bet)}.`,
    `Current exact face: ${session.state.exactRollFace}.`,
    `Current High / Low pick: ${capitalize(session.state.exactRollHighLowChoice)}.`,
    "Use the buttons below to place the bet directly.",
  ];
};

const buildExactRollComponentRows = ({
  hasAffordableBet,
  roundActive,
  session,
}: DiceCasinoGameViewContext): DiceCasinoActionRows => {
  if (roundActive) {
    return [];
  }

  const rows: DiceCasinoActionRows = [];
  const exactModeRow: DiceCasinoActionRow = [
    {
      action: { type: "exact-mode", ownerId: session.userId, mode: "exact-face" } as const,
      label: "Exact Face",
      style: session.state.exactRollMode === "exact-face" ? "primary" : "secondary",
    },
    {
      action: { type: "exact-mode", ownerId: session.userId, mode: "high-low" } as const,
      label: "High / Low",
      style: session.state.exactRollMode === "high-low" ? "primary" : "secondary",
    },
  ];

  if (session.state.exactRollMode === "exact-face") {
    exactModeRow.push({
      action: { type: "exact-face", ownerId: session.userId, face: 6 } as const,
      label: "6",
      style: session.state.exactRollFace === 6 ? "primary" : "secondary",
      disabled: !hasAffordableBet,
    });
  }

  rows.push(exactModeRow);

  if (session.state.exactRollMode === "exact-face") {
    const faceRow: DiceCasinoActionRow = Array.from({ length: 5 }, (_, index) => index + 1).map(
      (face) => ({
        action: { type: "exact-face", ownerId: session.userId, face } as const,
        label: `${face}`,
        style: session.state.exactRollFace === face ? "primary" : "secondary",
        disabled: !hasAffordableBet,
      }),
    );
    rows.push(faceRow);
  } else {
    const choiceRow: DiceCasinoActionRow = [
      {
        action: { type: "exact-high-low", ownerId: session.userId, choice: "low" } as const,
        label: "Low (1-3)",
        style: session.state.exactRollHighLowChoice === "low" ? "primary" : "secondary",
        disabled: !hasAffordableBet,
      },
      {
        action: { type: "exact-high-low", ownerId: session.userId, choice: "high" } as const,
        label: "High (4-6)",
        style: session.state.exactRollHighLowChoice === "high" ? "primary" : "secondary",
        disabled: !hasAffordableBet,
      },
    ];
    rows.push(choiceRow);
  }

  return rows;
};

const startExactRollRound = (): MutateSessionResult => {
  return replyMutation("Use the Exact Roll buttons below to place that bet.", true);
};

const handleExactRollAction = (
  { analytics, economy, pips, session }: DiceCasinoMutationContext,
  action: DiceCasinoAction,
): MutateSessionResult | null => {
  if (action.type === "exact-mode") {
    if (session.state.activeRound || session.state.selectedGame !== "exact-roll") {
      return invalidCasinoAction();
    }

    return viewMutation(
      {
        ...session,
        state: {
          ...session.state,
          exactRollMode: action.mode,
        },
      },
      pips,
    );
  }

  if (action.type === "exact-face") {
    if (session.state.activeRound || session.state.selectedGame !== "exact-roll") {
      return invalidCasinoAction();
    }

    if (!canStartCasinoRound(session.bet, pips)) {
      return insufficientPipsReply(session.bet, pips);
    }

    let nextPips = economy.applyPipsDelta({ userId: session.userId, amount: -session.bet });
    const rolledFace = rollDie(6);
    const resolution = resolveExactRollFace(session.bet, action.face, rolledFace);
    if (resolution.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: session.userId, amount: resolution.payout });
    }

    analytics.recordRoundStarted({
      userId: session.userId,
      game: "exact-roll",
      betTier: getDiceCasinoBetTier(session.bet),
      wagered: session.bet,
    });
    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "exact-roll",
      betTier: getDiceCasinoBetTier(session.bet),
      payout: resolution.payout,
      outcome: getOutcomeFromPayout(session.bet, resolution.payout),
    });

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            exactRollFace: action.face,
            exactRollMode: "exact-face",
            lastOutcome: resolution.won
              ? `Exact Face hit. You picked ${action.face} and rolled ${rolledFace}. Paid ${resolution.payout} pips total.`
              : `Exact Face missed. You picked ${action.face} and rolled ${rolledFace}.`,
          },
        },
        nextPips,
      ),
      nextPips,
    );
  }

  if (action.type === "exact-high-low") {
    if (session.state.activeRound || session.state.selectedGame !== "exact-roll") {
      return invalidCasinoAction();
    }

    if (!canStartCasinoRound(session.bet, pips)) {
      return insufficientPipsReply(session.bet, pips);
    }

    let nextPips = economy.applyPipsDelta({ userId: session.userId, amount: -session.bet });
    const rolledFace = rollDie(6);
    const resolution = resolveExactRollHighLow(session.bet, action.choice, rolledFace);
    if (resolution.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: session.userId, amount: resolution.payout });
    }

    analytics.recordRoundStarted({
      userId: session.userId,
      game: "exact-roll",
      betTier: getDiceCasinoBetTier(session.bet),
      wagered: session.bet,
    });
    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "exact-roll",
      betTier: getDiceCasinoBetTier(session.bet),
      payout: resolution.payout,
      outcome: getOutcomeFromPayout(session.bet, resolution.payout),
    });

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            exactRollHighLowChoice: action.choice,
            exactRollMode: "high-low",
            lastOutcome: resolution.won
              ? `High / Low hit. You picked ${capitalize(action.choice)} and rolled ${rolledFace}. Paid ${resolution.payout} pips total.`
              : `High / Low missed. You picked ${capitalize(action.choice)} and rolled ${rolledFace}.`,
          },
        },
        nextPips,
      ),
      nextPips,
    );
  }

  return null;
};

export const exactRollGameModule: DiceCasinoGameModule = {
  game: "exact-roll",
  startRound: startExactRollRound,
  handleAction: handleExactRollAction,
  buildDescriptionLines: buildExactRollDescriptionLines,
  buildComponentRows: buildExactRollComponentRows,
};
