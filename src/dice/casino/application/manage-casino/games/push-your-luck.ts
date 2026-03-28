import {
  advancePushYourLuckRound,
  canPushYourLuckCashOut,
  createPushYourLuckRound,
  formatDieFace,
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
  grantCasinoPayout,
  insufficientPipsReply,
  invalidCasinoAction,
  normalizeSessionBet,
  recordCompletedCasinoGame,
  viewMutation,
} from "../helpers";
import { awardManualDiceAchievements } from "../../../../progression/application/achievement-awards";
import { createAchievementAnnouncement } from "../../../../progression/application/achievement-announcements";
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

const buildPushYourLuckDescriptionLines = (
  session: DiceCasinoMutationContext["session"],
): string[] => {
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

  const actionTarget = {
    ownerId: session.userId,
    sessionToken: session.state.sessionToken,
  } as const;
  const roundRow: DiceCasinoActionRow = [
    {
      action: { type: "push-roll", ...actionTarget } as const,
      label: "Roll",
      style: "primary",
    },
    {
      action: { type: "push-cashout", ...actionTarget } as const,
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
        currentScreen: "setup",
        activeRound: pushRound,
        lastOutcome: `Push Your Luck started. First roll: ${formatDieFace(pushRound.rolls[0]!)}.`,
      },
    },
    nextPips,
  );
};

const handlePushYourLuckAction = (
  { analytics, contracts, economy, nowMs, progression, pips, session }: DiceCasinoMutationContext,
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
              currentScreen: "setup",
              activeRound: rollResult.round,
              lastOutcome: `Rolled ${formatDieFace(
                rollResult.round.rolls.at(-1) ?? rollResult.round.rolls[0]!,
              )}.`,
            },
          },
          pips,
        ),
        pips,
      );
    }

    if (rollResult.kind === "bust") {
      const achievementStats = analytics.recordRoundCompleted({
        userId: session.userId,
        game: "push-your-luck",
        betTier: getDiceCasinoBetTier(round.bet),
        wagered: round.bet,
        payout: 0,
        outcome: "loss",
      });
      recordCompletedCasinoGame(contracts, session.userId, nowMs);
      const newlyEarned = awardManualDiceAchievements(
        progression,
        session.userId,
        getCasinoAchievementIds(achievementStats),
      );
      const achievementAnnouncements = [
        createAchievementAnnouncement(session.userId, newlyEarned),
      ].flatMap((announcement) => (announcement ? [announcement] : []));

      return viewMutation(
        normalizeSessionBet(
          {
            ...session,
            state: {
              ...session.state,
              currentScreen: "result",
              activeRound: null,
              lastOutcome: `Bust. Repeated ${formatDieFace(rollResult.rolledValue)}.`,
            },
          },
          pips,
        ),
        pips,
        achievementAnnouncements,
      );
    }

    const reward = grantCasinoPayout(economy, session.userId, rollResult.payout, round.bet, pips);
    const nextPips = reward.pips;
    const achievementStats = analytics.recordRoundCompleted({
      userId: session.userId,
      game: "push-your-luck",
      betTier: getDiceCasinoBetTier(round.bet),
      wagered: round.bet,
      payout: rollResult.payout,
      outcome: getOutcomeFromPayout(round.bet, rollResult.payout),
      achievementEvent: { type: "push-perfect-run" },
    });
    recordCompletedCasinoGame(contracts, session.userId, nowMs);
    const newlyEarned = awardManualDiceAchievements(
      progression,
      session.userId,
      getCasinoAchievementIds(achievementStats),
    );
    const achievementAnnouncements = [
      createAchievementAnnouncement(session.userId, newlyEarned),
    ].flatMap((announcement) => (announcement ? [announcement] : []));

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            currentScreen: "result",
            activeRound: null,
            lastOutcome: `Perfect run. Reached ${getPushYourLuckAutoCashoutAtUniqueFaces()} uniques and paid ${reward.awardedPayout} pips.`,
          },
        },
        nextPips,
      ),
      nextPips,
      achievementAnnouncements,
    );
  }

  if (action.type === "push-cashout") {
    const round = getExpectedRound(session.state.activeRound, "push-your-luck");
    if (!round || !canPushYourLuckCashOut(round)) {
      return invalidCasinoAction();
    }

    const payout = getPushYourLuckCashoutPayout(round.bet, round.uniqueValues.length);
    const reward = grantCasinoPayout(economy, session.userId, payout, round.bet, pips);
    const nextPips = reward.pips;
    const achievementStats = analytics.recordRoundCompleted({
      userId: session.userId,
      game: "push-your-luck",
      betTier: getDiceCasinoBetTier(round.bet),
      wagered: round.bet,
      payout,
      outcome: getOutcomeFromPayout(round.bet, payout),
      achievementEvent: { type: "push-cashout" },
    });
    recordCompletedCasinoGame(contracts, session.userId, nowMs);
    const newlyEarned = awardManualDiceAchievements(
      progression,
      session.userId,
      getCasinoAchievementIds(achievementStats),
    );
    const achievementAnnouncements = [
      createAchievementAnnouncement(session.userId, newlyEarned),
    ].flatMap((announcement) => (announcement ? [announcement] : []));

    return viewMutation(
      normalizeSessionBet(
        {
          ...session,
          state: {
            ...session.state,
            currentScreen: "result",
            activeRound: null,
            lastOutcome: `Cashed out at ${round.uniqueValues.length} uniques for ${reward.awardedPayout} pips.`,
          },
        },
        nextPips,
      ),
      nextPips,
      achievementAnnouncements,
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
