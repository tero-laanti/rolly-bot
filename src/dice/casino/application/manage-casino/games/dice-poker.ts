import {
  createDicePokerRound,
  describePokerResult,
  formatDice,
  getDiceCasinoBetTier,
  rerollDicePokerRound,
} from "../../../domain/game-rules";
import {
  canStartCasinoRound,
  getExpectedRound,
  getOutcomeFromPayout,
  insufficientPipsReply,
  invalidCasinoAction,
  normalizeSessionBet,
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

const buildDicePokerDescriptionLines = (session: DiceCasinoMutationContext["session"]): string[] => {
  const lines = [
    "**Dice Poker**",
    "Roll 5d8, hold any subset from 0 to 5 dice, then reroll the rest once.",
    `Five of a Kind: ${session.bet * 20} total.`,
    `Four of a Kind: ${session.bet * 10} total.`,
    `Full House: ${session.bet * 3} total.`,
    `Straight: ${session.bet * 3} total.`,
    "Straight means 1-5, 2-6, 3-7, or 4-8.",
  ];

  const round = getExpectedRound(session.state.activeRound, "dice-poker");
  if (round) {
    lines.push("", "Initial roll:");
    for (const [index, value] of round.initialRoll.entries()) {
      lines.push(
        `Die ${index + 1}: [${value}] ${round.heldIndices.includes(index) ? "(held)" : ""}`.trim(),
      );
    }
  }

  return lines;
};

const buildDicePokerComponentRows = ({
  session,
}: DiceCasinoGameViewContext): DiceCasinoActionRows => {
  const round = getExpectedRound(session.state.activeRound, "dice-poker");
  if (!round) {
    return [];
  }

  const holdRow: DiceCasinoActionRow = round.initialRoll.map((_, index) => ({
    action: { type: "poker-toggle-hold", ownerId: session.userId, index } as const,
    label: round.heldIndices.includes(index) ? `Release ${index + 1}` : `Hold ${index + 1}`,
    style: round.heldIndices.includes(index) ? "danger" : "secondary",
  }));
  const actionRow: DiceCasinoActionRow = [
    {
      action: { type: "poker-reroll", ownerId: session.userId } as const,
      label: "Reroll",
      style: "success",
    },
    {
      action: { type: "poker-cancel", ownerId: session.userId } as const,
      label: "Cancel",
      style: "danger",
    },
  ];

  return [holdRow, actionRow];
};

const startDicePokerRound = ({
  analytics,
  economy,
  pips,
  session,
}: DiceCasinoMutationContext): MutateSessionResult => {
  if (!canStartCasinoRound(session.bet, pips)) {
    return insufficientPipsReply(session.bet, pips);
  }

  const nextPips = economy.applyPipsDelta({ userId: session.userId, amount: -session.bet });
  const pokerRound = createDicePokerRound(session.bet);

  analytics.recordRoundStarted({
    userId: session.userId,
    game: "dice-poker",
    betTier: getDiceCasinoBetTier(session.bet),
    wagered: session.bet,
  });

  return viewMutation(
    {
      ...session,
      state: {
        ...session.state,
        activeRound: pokerRound,
        lastOutcome: "Dice Poker hand started. Hold any dice, including all 5, then reroll once.",
      },
    },
    nextPips,
  );
};

const handleDicePokerAction = (
  { analytics, economy, pips, session }: DiceCasinoMutationContext,
  action: DiceCasinoAction,
): MutateSessionResult | null => {
  if (action.type === "poker-toggle-hold") {
    const round = getExpectedRound(session.state.activeRound, "dice-poker");
    if (!round || action.index < 0 || action.index >= round.initialRoll.length) {
      return invalidCasinoAction();
    }

    const heldIndices = round.heldIndices.includes(action.index)
      ? round.heldIndices.filter((index) => index !== action.index)
      : [...round.heldIndices, action.index].sort((left, right) => left - right);

    return viewMutation(
      {
        ...session,
        state: {
          ...session.state,
          activeRound: {
            ...round,
            heldIndices,
          },
        },
      },
      pips,
    );
  }

  if (action.type === "poker-reroll") {
    const round = getExpectedRound(session.state.activeRound, "dice-poker");
    if (!round) {
      return invalidCasinoAction();
    }

    const rerollResult = rerollDicePokerRound(round);
    let nextPips = pips;
    if (rerollResult.result.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: session.userId, amount: rerollResult.result.payout });
    }

    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "dice-poker",
      betTier: getDiceCasinoBetTier(round.bet),
      payout: rerollResult.result.payout,
      outcome: getOutcomeFromPayout(round.bet, rerollResult.result.payout),
    });

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            activeRound: null,
            lastOutcome: `Final hand ${formatDice(rerollResult.finalRoll)}. ${describePokerResult(
              rerollResult.result,
            )}`,
          },
        },
        nextPips,
      ),
      nextPips,
    );
  }

  if (action.type === "poker-cancel") {
    const round = getExpectedRound(session.state.activeRound, "dice-poker");
    if (!round) {
      return invalidCasinoAction();
    }

    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "dice-poker",
      betTier: getDiceCasinoBetTier(round.bet),
      payout: 0,
      outcome: "loss",
    });

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            activeRound: null,
            lastOutcome: "Dice Poker hand cancelled. Bet forfeited.",
          },
        },
        pips,
      ),
      pips,
    );
  }

  return null;
};

export const dicePokerGameModule: DiceCasinoGameModule = {
  game: "dice-poker",
  startRound: startDicePokerRound,
  handleAction: handleDicePokerAction,
  buildDescriptionLines: buildDicePokerDescriptionLines,
  buildComponentRows: buildDicePokerComponentRows,
};
