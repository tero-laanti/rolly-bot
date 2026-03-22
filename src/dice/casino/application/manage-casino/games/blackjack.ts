import {
  createBlackjackRound,
  formatBlackjackDice,
  formatDice,
  getBlackjackDealerStandOnTotal,
  getBlackjackHandTotals,
  getBlackjackDieSides,
  getBlackjackNaturalPayout,
  getBlackjackWinPayoutMultiplier,
  getDiceCasinoBetTier,
  hitBlackjackRound,
  isBlackjackNatural,
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
import { awardManualDiceAchievements } from "../../../../progression/application/achievement-awards";
import { appendAchievementUnlockText } from "../../../../progression/application/achievement-text";
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

const buildBlackjackDescriptionLines = (
  session: DiceCasinoMutationContext["session"],
): string[] => {
  const lines = [
    "**Blackjack**",
    `d${getBlackjackDieSides()} draws. A 1 is Ace (1 or 11). Dealer stands on soft ${getBlackjackDealerStandOnTotal()}.`,
    `Normal win: ${session.bet * getBlackjackWinPayoutMultiplier()} total.`,
    `Push: ${session.bet} total.`,
    `Natural 21: ${getBlackjackNaturalPayout(session.bet)}.`,
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

  const actionTarget = {
    ownerId: session.userId,
    sessionToken: session.state.sessionToken,
  } as const;
  const roundRow: DiceCasinoActionRow = [
    {
      action: { type: "blackjack-hit", ...actionTarget } as const,
      label: "Hit",
      style: "primary",
    },
    {
      action: { type: "blackjack-stand", ...actionTarget } as const,
      label: "Stand",
      style: "success",
    },
  ];

  return [roundRow];
};

const startBlackjackRound = ({
  analytics,
  economy,
  progression,
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

    const openingOutcome = getOutcomeFromPayout(session.bet, resolution.payout);
    const achievementStats = analytics.recordRoundCompleted({
      userId: session.userId,
      game: "blackjack",
      betTier: getDiceCasinoBetTier(session.bet),
      wagered: session.bet,
      payout: resolution.payout,
      outcome: openingOutcome,
      achievementEvent: isBlackjackNatural(resolution.playerHand)
        ? { type: "blackjack-natural" }
        : openingOutcome === "push"
          ? { type: "blackjack-push" }
          : undefined,
    });
    const newlyEarned = awardManualDiceAchievements(
      progression,
      session.userId,
      getCasinoAchievementIds(achievementStats),
    );

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            currentScreen: "result",
            activeRound: null,
            lastOutcome: appendAchievementUnlockText(
              `${resolution.summary}\nDealer: ${formatDice(resolution.dealerHand)}.\nYou: ${formatDice(
                resolution.playerHand,
              )}.`,
              newlyEarned,
            ),
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
        currentScreen: "setup",
        activeRound: resolution.round,
        lastOutcome: "Blackjack hand started.",
      },
    },
    nextPips,
  );
};

const handleBlackjackAction = (
  { analytics, economy, progression, pips, session }: DiceCasinoMutationContext,
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
            currentScreen: "setup",
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

    const playerTotal = getBlackjackHandTotals(resolution.playerHand).total;
    const outcome = getOutcomeFromPayout(round.bet, resolution.payout);
    const achievementStats = analytics.recordRoundCompleted({
      userId: session.userId,
      game: "blackjack",
      betTier: getDiceCasinoBetTier(round.bet),
      wagered: round.bet,
      payout: resolution.payout,
      outcome,
      achievementEvent:
        outcome === "push"
          ? { type: "blackjack-push" }
          : outcome === "win" && playerTotal === 21
            ? { type: "blackjack-hit-to-21-win" }
            : undefined,
    });
    const newlyEarned = awardManualDiceAchievements(
      progression,
      session.userId,
      getCasinoAchievementIds(achievementStats),
    );

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            currentScreen: "result",
            activeRound: null,
            lastOutcome: appendAchievementUnlockText(
              `${resolution.summary}\nDealer: ${formatDice(resolution.dealerHand)}.\nYou: ${formatDice(
                resolution.playerHand,
              )}.`,
              newlyEarned,
            ),
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

    const outcome = getOutcomeFromPayout(round.bet, resolution.payout);
    const achievementStats = analytics.recordRoundCompleted({
      userId: session.userId,
      game: "blackjack",
      betTier: getDiceCasinoBetTier(round.bet),
      wagered: round.bet,
      payout: resolution.payout,
      outcome,
      achievementEvent: outcome === "push" ? { type: "blackjack-push" } : undefined,
    });
    const newlyEarned = awardManualDiceAchievements(
      progression,
      session.userId,
      getCasinoAchievementIds(achievementStats),
    );

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            currentScreen: "result",
            activeRound: null,
            lastOutcome: appendAchievementUnlockText(
              `${resolution.summary}\nDealer: ${formatDice(resolution.dealerHand)}.\nYou: ${formatDice(
                resolution.playerHand,
              )}.`,
              newlyEarned,
            ),
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
