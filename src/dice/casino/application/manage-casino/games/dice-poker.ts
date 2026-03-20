import {
  createDicePokerRound,
  dicePokerDieSides,
  describePokerResult,
  dicePokerDiceCount,
  formatDice,
  getDiceCasinoBetTier,
  getDicePokerPayoutMultiplier,
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
import { awardManualDiceAchievements } from "../../../../progression/application/achievement-awards";
import { getCasinoAchievementIds } from "../../achievement-rules";
import type {
  DiceCasinoAction,
  DiceCasinoActionRow,
  DiceCasinoActionRows,
  DiceCasinoGameModule,
  DiceCasinoGameViewContext,
  DiceCasinoMutationContext,
  MutateSessionResult,
} from "../types";

const buildStraightExamples = (): string => {
  const maxStart = dicePokerDieSides - dicePokerDiceCount + 1;
  const ranges: string[] = [];

  for (let start = 1; start <= maxStart; start += 1) {
    ranges.push(`${start}-${start + dicePokerDiceCount - 1}`);
  }

  return ranges.join(", ");
};

const buildDicePokerDescriptionLines = (
  session: DiceCasinoMutationContext["session"],
): string[] => {
  const lines = [
    "**Dice Poker**",
    `Roll ${dicePokerDiceCount}d${dicePokerDieSides}, hold any subset from 0 to ${dicePokerDiceCount} dice, then reroll the rest once.`,
    `Five of a Kind: ${session.bet * getDicePokerPayoutMultiplier("five-of-a-kind")} total.`,
    `Four of a Kind: ${session.bet * getDicePokerPayoutMultiplier("four-of-a-kind")} total.`,
    `Full House: ${session.bet * getDicePokerPayoutMultiplier("full-house")} total.`,
    `Straight: ${session.bet * getDicePokerPayoutMultiplier("straight")} total.`,
    `Straight means ${buildStraightExamples()}.`,
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

  const actionTarget = {
    ownerId: session.userId,
    sessionToken: session.state.sessionToken,
  } as const;
  const holdRow: DiceCasinoActionRow = round.initialRoll.map((_, index) => ({
    action: { type: "poker-toggle-hold", ...actionTarget, index } as const,
    label: round.heldIndices.includes(index) ? `Release ${index + 1}` : `Hold ${index + 1}`,
    style: round.heldIndices.includes(index) ? "danger" : "secondary",
  }));
  const actionRow: DiceCasinoActionRow = [
    {
      action: { type: "poker-reroll", ...actionTarget } as const,
      label: "Reroll",
      style: "success",
    },
    {
      action: { type: "poker-cancel", ...actionTarget } as const,
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
        lastOutcome: `Dice Poker hand started. Hold any dice, including all ${dicePokerDiceCount}, then reroll once.`,
      },
    },
    nextPips,
  );
};

const handleDicePokerAction = (
  { analytics, economy, progression, pips, session }: DiceCasinoMutationContext,
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
      nextPips = economy.applyPipsDelta({
        userId: session.userId,
        amount: rerollResult.result.payout,
      });
    }

    const achievementStats = analytics.recordRoundCompleted({
      userId: session.userId,
      game: "dice-poker",
      betTier: getDiceCasinoBetTier(round.bet),
      wagered: round.bet,
      payout: rerollResult.result.payout,
      outcome: getOutcomeFromPayout(round.bet, rerollResult.result.payout),
      achievementEvent:
        rerollResult.result.kind === "loss"
          ? undefined
          : {
              type: "poker-hand",
              handKind: rerollResult.result.kind,
            },
    });
    awardManualDiceAchievements(progression, session.userId, getCasinoAchievementIds(achievementStats));

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

    const achievementStats = analytics.recordRoundCompleted({
      userId: session.userId,
      game: "dice-poker",
      betTier: getDiceCasinoBetTier(round.bet),
      wagered: round.bet,
      payout: 0,
      outcome: "loss",
    });
    awardManualDiceAchievements(progression, session.userId, getCasinoAchievementIds(achievementStats));

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
