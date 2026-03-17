import {
  advancePushYourLuckRound,
  canPushYourLuckCashOut,
  createPushYourLuckRound,
  formatDice,
  getDiceCasinoBetTier,
  getPushYourLuckAutoCashoutAtUniqueFaces,
  getPushYourLuckCashoutStartUniqueFaces,
  getPushYourLuckCashoutPayout,
  getPushYourLuckDieSides,
  getPushYourLuckPayoutTable,
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

const buildPushYourLuckDescriptionLines = (session: DiceCasinoMutationContext["session"]): string[] => {
  const lines = [
    "**Push Your Luck**",
    `Roll 1d${getPushYourLuckDieSides()}. If you repeat a face, you bust. Cash out from ${getPushYourLuckCashoutStartUniqueFaces()} uniques onward.`,
    ...getPushYourLuckPayoutTable().map(
      (payout) =>
        `${payout.uniqueFaces} uniques: ${getPushYourLuckCashoutPayout(session.bet, payout.uniqueFaces)} total.`,
    ),
  ];

  const round = getExpectedRound(session.state.activeRound, "push-your-luck");
  if (round) {
    lines.push(
      "",
      `Active rolls: ${formatDice(round.rolls)}.`,
      `Unique faces: ${round.uniqueValues.length}.`,
      `Cashout available: ${canPushYourLuckCashOut(round) ? "yes" : "no"}.`,
    );
  }

  return lines;
};

const buildPushYourLuckComponentRows = ({
  session,
}: DiceCasinoGameViewContext): DiceCasinoActionRows => {
  const round = getExpectedRound(session.state.activeRound, "push-your-luck");
  if (!round) {
    return [];
  }

  const roundRow: DiceCasinoActionRow = [
    {
      action: { type: "push-roll", ownerId: session.userId } as const,
      label: "Roll",
      style: "primary",
    },
    {
      action: { type: "push-cashout", ownerId: session.userId } as const,
      label: "Cash Out",
      style: "success",
      disabled: !canPushYourLuckCashOut(round),
    },
  ];

  return [roundRow];
};

const startPushYourLuckRound = ({
  analytics,
  economy,
  pips,
  session,
}: DiceCasinoMutationContext): MutateSessionResult => {
  if (!canStartCasinoRound(session.bet, pips)) {
    return insufficientPipsReply(session.bet, pips);
  }

  const nextPips = economy.applyPipsDelta({ userId: session.userId, amount: -session.bet });
  const pushRound = createPushYourLuckRound(session.bet);

  analytics.recordRoundStarted({
    userId: session.userId,
    game: "push-your-luck",
    betTier: getDiceCasinoBetTier(session.bet),
    wagered: session.bet,
  });

  return viewMutation(
    {
      ...session,
      state: {
        ...session.state,
        activeRound: pushRound,
        lastOutcome: `Push Your Luck started. First roll: ${pushRound.rolls[0]}.`,
      },
    },
    nextPips,
  );
};

const handlePushYourLuckAction = (
  { analytics, economy, pips, session }: DiceCasinoMutationContext,
  action: DiceCasinoAction,
): MutateSessionResult | null => {
  if (action.type === "push-roll") {
    const round = getExpectedRound(session.state.activeRound, "push-your-luck");
    if (!round) {
      return invalidCasinoAction();
    }

    const rollResult = advancePushYourLuckRound(round);
    if (rollResult.kind === "active") {
      return viewMutation(
        normalizeSessionBet(
          {
            ...session,
            state: {
              ...session.state,
              activeRound: rollResult.round,
              lastOutcome: `Rolled ${rollResult.round.rolls.at(-1) ?? rollResult.round.rolls[0]}. ${rollResult.round.uniqueValues.length} unique faces so far.`,
            },
          },
          pips,
        ),
        pips,
      );
    }

    if (rollResult.kind === "bust") {
      analytics.recordRoundCompleted({
        userId: session.userId,
        game: "push-your-luck",
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
              lastOutcome: `Bust. You repeated ${rollResult.rolledValue} and lost the round.`,
            },
          },
          pips,
        ),
        pips,
      );
    }

    const nextPips = economy.applyPipsDelta({ userId: session.userId, amount: rollResult.payout });
    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "push-your-luck",
      betTier: getDiceCasinoBetTier(round.bet),
      payout: rollResult.payout,
      outcome: getOutcomeFromPayout(round.bet, rollResult.payout),
    });

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            activeRound: null,
            lastOutcome: `Perfect run. Rolled ${rollResult.rolledValue} for ${getPushYourLuckAutoCashoutAtUniqueFaces()} uniques and paid ${rollResult.payout} pips total.`,
          },
        },
        nextPips,
      ),
      nextPips,
    );
  }

  if (action.type === "push-cashout") {
    const round = getExpectedRound(session.state.activeRound, "push-your-luck");
    if (!round || !canPushYourLuckCashOut(round)) {
      return invalidCasinoAction();
    }

    const payout = getPushYourLuckCashoutPayout(round.bet, round.uniqueValues.length);
    const nextPips = economy.applyPipsDelta({ userId: session.userId, amount: payout });
    analytics.recordRoundCompleted({
      userId: session.userId,
      game: "push-your-luck",
      betTier: getDiceCasinoBetTier(round.bet),
      payout,
      outcome: getOutcomeFromPayout(round.bet, payout),
    });

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            activeRound: null,
            lastOutcome: `Cashed out after ${round.uniqueValues.length} uniques for ${payout} pips total.`,
          },
        },
        nextPips,
      ),
      nextPips,
    );
  }

  return null;
};

export const pushYourLuckGameModule: DiceCasinoGameModule = {
  game: "push-your-luck",
  startRound: startPushYourLuckRound,
  handleAction: handlePushYourLuckAction,
  buildDescriptionLines: buildPushYourLuckDescriptionLines,
  buildComponentRows: buildPushYourLuckComponentRows,
};
