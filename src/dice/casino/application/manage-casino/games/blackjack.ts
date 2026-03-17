import {
  createBlackjackRound,
  formatBlackjackDice,
  formatDice,
  getBlackjackHandTotals,
  getBlackjackNaturalPayout,
  getDiceCasinoBetTier,
  hitBlackjackRound,
  resolveBlackjackOpening,
  standBlackjackRound,
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

const buildBlackjackDescriptionLines = (session: DiceCasinoMutationContext["session"]): string[] => {
  const lines = [
    "**Blackjack**",
    "d10 draws. A 1 is Ace (1 or 11). Dealer stands on soft 17.",
    `Normal win: ${session.bet * 2} total.`,
    `Push: ${session.bet} total.`,
    `Natural: ${getBlackjackNaturalPayout(session.bet)} total.`,
    "Dealer natural is checked immediately after the opening deal.",
  ];

  const round = getExpectedRound(session.state.activeRound, "blackjack");
  if (round) {
    lines.push(
      "",
      `Dealer: ${formatBlackjackDice(round.dealerHand, true)}.`,
      `Your hand: ${formatDice(round.playerHand)} (${getBlackjackHandTotals(round.playerHand).total}).`,
    );
  }

  return lines;
};

const buildBlackjackComponentRows = ({
  session,
}: DiceCasinoGameViewContext): DiceCasinoActionRows => {
  const round = getExpectedRound(session.state.activeRound, "blackjack");
  if (!round) {
    return [];
  }

  const roundRow: DiceCasinoActionRow = [
    {
      action: { type: "blackjack-hit", ownerId: session.userId } as const,
      label: "Hit",
      style: "primary",
    },
    {
      action: { type: "blackjack-stand", ownerId: session.userId } as const,
      label: "Stand",
      style: "success",
    },
  ];

  return [roundRow];
};

const startBlackjackRound = ({
  analytics,
  economy,
  pips,
  session,
}: DiceCasinoMutationContext): MutateSessionResult => {
  if (!canStartCasinoRound(session.bet, pips)) {
    return insufficientPipsReply(session.bet, pips);
  }

  let nextPips = economy.applyPipsDelta({ userId: session.userId, amount: -session.bet });
  analytics.recordRoundStarted({
    userId: session.userId,
    game: "blackjack",
    betTier: getDiceCasinoBetTier(session.bet),
    wagered: session.bet,
  });

  const openingRound = createBlackjackRound(session.bet);
  const resolution = resolveBlackjackOpening(openingRound);
  if (resolution.kind === "resolved") {
    if (resolution.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: session.userId, amount: resolution.payout });
    }

    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "blackjack",
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
            activeRound: null,
            lastOutcome: `${resolution.summary} Dealer: ${formatDice(resolution.dealerHand)}. You: ${formatDice(
              resolution.playerHand,
            )}.`,
          },
        },
        nextPips,
      ),
      nextPips,
    );
  }

  return viewMutation(
    {
      ...session,
      state: {
        ...session.state,
        activeRound: resolution.round,
        lastOutcome: "Blackjack hand started.",
      },
    },
    nextPips,
  );
};

const handleBlackjackAction = (
  { analytics, economy, pips, session }: DiceCasinoMutationContext,
  action: DiceCasinoAction,
): MutateSessionResult | null => {
  if (action.type === "blackjack-hit") {
    const round = getExpectedRound(session.state.activeRound, "blackjack");
    if (!round) {
      return invalidCasinoAction();
    }

    const resolution = hitBlackjackRound(round);
    if (resolution.kind === "active") {
      return viewMutation(
        {
          ...session,
          state: {
            ...session.state,
            activeRound: resolution.round,
            lastOutcome: `You drew ${resolution.round.playerHand.at(-1) ?? resolution.round.playerHand[0]}.`,
          },
        },
        pips,
      );
    }

    let nextPips = pips;
    if (resolution.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: session.userId, amount: resolution.payout });
    }

    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "blackjack",
      betTier: getDiceCasinoBetTier(round.bet),
      payout: resolution.payout,
      outcome: getOutcomeFromPayout(round.bet, resolution.payout),
    });

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            activeRound: null,
            lastOutcome: `${resolution.summary} Dealer: ${formatDice(resolution.dealerHand)}. You: ${formatDice(
              resolution.playerHand,
            )}.`,
          },
        },
        nextPips,
      ),
      nextPips,
    );
  }

  if (action.type === "blackjack-stand") {
    const round = getExpectedRound(session.state.activeRound, "blackjack");
    if (!round) {
      return invalidCasinoAction();
    }

    const resolution = standBlackjackRound(round);
    if (resolution.kind !== "resolved") {
      return invalidCasinoAction();
    }

    let nextPips = pips;
    if (resolution.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: session.userId, amount: resolution.payout });
    }

    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "blackjack",
      betTier: getDiceCasinoBetTier(round.bet),
      payout: resolution.payout,
      outcome: getOutcomeFromPayout(round.bet, resolution.payout),
    });

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            activeRound: null,
            lastOutcome: `${resolution.summary} Dealer: ${formatDice(resolution.dealerHand)}. You: ${formatDice(
              resolution.playerHand,
            )}.`,
          },
        },
        nextPips,
      ),
      nextPips,
    );
  }

  return null;
};

export const blackjackGameModule: DiceCasinoGameModule = {
  game: "blackjack",
  startRound: startBlackjackRound,
  handleAction: handleBlackjackAction,
  buildDescriptionLines: buildBlackjackDescriptionLines,
  buildComponentRows: buildBlackjackComponentRows,
};
