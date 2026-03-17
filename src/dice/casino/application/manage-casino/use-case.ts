import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceCasinoAnalyticsRepository, DiceCasinoSessionRepository } from "../ports";
import {
  createDefaultDiceCasinoSessionState,
  type DiceCasinoActiveRound,
  type DiceCasinoGame,
  type DiceCasinoSession,
  type ExactRollHighLowChoice,
  type ExactRollMode,
} from "../../domain/casino-session";
import {
  advancePushYourLuckRound,
  canPushYourLuckCashOut,
  clampDiceCasinoBet,
  createBlackjackRound,
  createDicePokerRound,
  createPushYourLuckRound,
  describePokerResult,
  diceCasinoDefaultBet,
  diceCasinoMaxBet,
  diceCasinoMinBet,
  diceCasinoSessionTimeoutMs,
  formatBlackjackDice,
  formatDice,
  getBlackjackHandTotals,
  getBlackjackNaturalPayout,
  getDiceCasinoBetTier,
  getDiceCasinoGameLabel,
  getExactRollFacePayout,
  getExactRollHighLowPayout,
  getPushYourLuckCashoutPayout,
  hitBlackjackRound,
  rerollDicePokerRound,
  resolveBlackjackOpening,
  resolveExactRollFace,
  resolveExactRollHighLow,
  rollDie,
  standBlackjackRound,
} from "../../domain/game-rules";

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
      adjustment: "min" | "max" | "-10" | "-1" | "+1" | "+10";
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

type ManageCasinoDependencies = {
  analytics: DiceCasinoAnalyticsRepository;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getPips">;
  sessions: DiceCasinoSessionRepository;
  unitOfWork: UnitOfWork;
};

type MutateSessionResult =
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

const gameButtonOrder: DiceCasinoGame[] = [
  "exact-roll",
  "push-your-luck",
  "blackjack",
  "dice-poker",
];

export const createDiceCasinoUseCase = ({
  analytics,
  economy,
  sessions,
  unitOfWork,
}: ManageCasinoDependencies) => {
  const createDiceCasinoReply = (
    userId: string,
    requestedBet: number | null,
    nowMs: number = Date.now(),
  ): DiceCasinoResult => {
    if (sessions.getActiveSession(userId, nowMs)) {
      return replyMessage("You already have an active casino session.", true);
    }

    const pips = economy.getPips(userId);
    const initialBet = resolveInitialBet(requestedBet, pips);
    if (!initialBet.ok) {
      return replyMessage(initialBet.message, true);
    }

    const session = createSessionRecord(userId, initialBet.bet, nowMs);
    sessions.saveSession(session);

    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildCasinoView(session, pips),
        ephemeral: false,
      },
    };
  };

  const handleDiceCasinoAction = (
    actorId: string,
    action: DiceCasinoAction,
    nowMs: number = Date.now(),
  ): DiceCasinoResult => {
    if (actorId !== action.ownerId) {
      return replyMessage("This casino session is not assigned to you.", true);
    }

    const mutation = unitOfWork.runInTransaction(() =>
      mutateCasinoSession({ action, analytics, economy, nowMs, sessions }),
    );

    if (mutation.kind === "reply") {
      return replyMessage(mutation.content, mutation.ephemeral);
    }

    if (mutation.kind === "expired") {
      return {
        kind: "edit",
        payload: {
          type: "message",
          content: "This casino session has expired. Start `/dice-casino` again.",
          clearComponents: true,
        },
      };
    }

    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildCasinoView(mutation.session, mutation.pips),
      },
    };
  };

  return {
    createDiceCasinoReply,
    handleDiceCasinoAction,
  };
};

const mutateCasinoSession = ({
  action,
  analytics,
  economy,
  nowMs,
  sessions,
}: {
  action: DiceCasinoAction;
  analytics: DiceCasinoAnalyticsRepository;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getPips">;
  nowMs: number;
  sessions: DiceCasinoSessionRepository;
}): MutateSessionResult => {
  const session = sessions.getActiveSession(action.ownerId, nowMs);
  if (!session) {
    return {
      kind: "expired",
    };
  }

  const initialPips = economy.getPips(action.ownerId);
  let nextSession = refreshSession(session, nowMs);
  let nextPips = initialPips;

  if (action.type === "refresh") {
    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "select-game") {
    if (nextSession.state.activeRound) {
      return {
        kind: "reply",
        content: "Finish the current round before switching games.",
        ephemeral: true,
      };
    }

    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        selectedGame: action.game,
        lastOutcome: null,
      },
    };
    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "adjust-bet") {
    if (nextSession.state.activeRound) {
      return {
        kind: "reply",
        content: "Finish the current round before changing the bet.",
        ephemeral: true,
      };
    }

    nextSession = {
      ...nextSession,
      bet: adjustSessionBet(nextSession.bet, action.adjustment, nextPips),
    };
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "exact-mode") {
    if (nextSession.state.activeRound || nextSession.state.selectedGame !== "exact-roll") {
      return invalidCasinoAction();
    }

    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        exactRollMode: action.mode,
      },
    };
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "exact-face") {
    if (nextSession.state.activeRound || nextSession.state.selectedGame !== "exact-roll") {
      return invalidCasinoAction();
    }

    if (!canStartCasinoRound(nextSession.bet, nextPips)) {
      return insufficientPipsReply(nextSession.bet, nextPips);
    }

    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        exactRollFace: action.face,
      },
    };
    nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: -nextSession.bet });
    const rolledFace = rollDie(6);
    const resolution = resolveExactRollFace(nextSession.bet, action.face, rolledFace);
    if (resolution.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: resolution.payout });
    }

    analytics.recordRoundStarted({
      userId: action.ownerId,
      game: "exact-roll",
      betTier: getDiceCasinoBetTier(nextSession.bet),
      wagered: nextSession.bet,
    });
    analytics.recordRoundCompleted({
      userId: action.ownerId,
      game: "exact-roll",
      betTier: getDiceCasinoBetTier(nextSession.bet),
      payout: resolution.payout,
      outcome: getOutcomeFromPayout(nextSession.bet, resolution.payout),
    });

    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        exactRollMode: "exact-face",
        lastOutcome: resolution.won
          ? `Exact Face hit. You picked ${action.face} and rolled ${rolledFace}. Paid ${resolution.payout} pips total.`
          : `Exact Face missed. You picked ${action.face} and rolled ${rolledFace}.`,
      },
    };
    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "exact-high-low") {
    if (nextSession.state.activeRound || nextSession.state.selectedGame !== "exact-roll") {
      return invalidCasinoAction();
    }

    if (!canStartCasinoRound(nextSession.bet, nextPips)) {
      return insufficientPipsReply(nextSession.bet, nextPips);
    }

    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        exactRollHighLowChoice: action.choice,
      },
    };
    nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: -nextSession.bet });
    const rolledFace = rollDie(6);
    const resolution = resolveExactRollHighLow(nextSession.bet, action.choice, rolledFace);
    if (resolution.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: resolution.payout });
    }

    analytics.recordRoundStarted({
      userId: action.ownerId,
      game: "exact-roll",
      betTier: getDiceCasinoBetTier(nextSession.bet),
      wagered: nextSession.bet,
    });
    analytics.recordRoundCompleted({
      userId: action.ownerId,
      game: "exact-roll",
      betTier: getDiceCasinoBetTier(nextSession.bet),
      payout: resolution.payout,
      outcome: getOutcomeFromPayout(nextSession.bet, resolution.payout),
    });

    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        exactRollMode: "high-low",
        lastOutcome: resolution.won
          ? `High / Low hit. You picked ${capitalize(action.choice)} and rolled ${rolledFace}. Paid ${resolution.payout} pips total.`
          : `High / Low missed. You picked ${capitalize(action.choice)} and rolled ${rolledFace}.`,
      },
    };
    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "play") {
    if (nextSession.state.activeRound) {
      return {
        kind: "reply",
        content: "Finish the current round before starting another one.",
        ephemeral: true,
      };
    }

    if (!canStartCasinoRound(nextSession.bet, nextPips)) {
      return insufficientPipsReply(nextSession.bet, nextPips);
    }

    if (nextSession.state.selectedGame === "exact-roll") {
      return {
        kind: "reply",
        content: "Use the Exact Roll buttons below to place that bet.",
        ephemeral: true,
      };
    }

    nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: -nextSession.bet });
    analytics.recordRoundStarted({
      userId: action.ownerId,
      game: nextSession.state.selectedGame,
      betTier: getDiceCasinoBetTier(nextSession.bet),
      wagered: nextSession.bet,
    });

    if (nextSession.state.selectedGame === "push-your-luck") {
      const pushRound = createPushYourLuckRound(nextSession.bet);
      nextSession = {
        ...nextSession,
        state: {
          ...nextSession.state,
          activeRound: pushRound,
          lastOutcome: `Push Your Luck started. First roll: ${pushRound.rolls[0]}.`,
        },
      };
      sessions.saveSession(nextSession);
      return {
        kind: "view",
        session: nextSession,
        pips: nextPips,
      };
    }

    if (nextSession.state.selectedGame === "blackjack") {
      const openingRound = createBlackjackRound(nextSession.bet);
      const resolution = resolveBlackjackOpening(openingRound);
      if (resolution.kind === "resolved") {
        if (resolution.payout > 0) {
          nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: resolution.payout });
        }
        analytics.recordRoundCompleted({
          userId: action.ownerId,
          game: "blackjack",
          betTier: getDiceCasinoBetTier(nextSession.bet),
          payout: resolution.payout,
          outcome: getOutcomeFromPayout(nextSession.bet, resolution.payout),
        });
        nextSession = {
          ...nextSession,
          state: {
            ...nextSession.state,
            activeRound: null,
            lastOutcome: `${resolution.summary} Dealer: ${formatDice(resolution.dealerHand)}. You: ${formatDice(
              resolution.playerHand,
            )}.`,
          },
        };
      } else {
        nextSession = {
          ...nextSession,
          state: {
            ...nextSession.state,
            activeRound: resolution.round,
            lastOutcome: "Blackjack hand started.",
          },
        };
      }

      nextSession = normalizeSessionBet(nextSession, nextPips);
      sessions.saveSession(nextSession);
      return {
        kind: "view",
        session: nextSession,
        pips: nextPips,
      };
    }

    const pokerRound = createDicePokerRound(nextSession.bet);
    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        activeRound: pokerRound,
        lastOutcome: "Dice Poker hand started. Hold any dice, including all 5, then reroll once.",
      },
    };
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "push-roll") {
    const round = getExpectedRound(nextSession.state.activeRound, "push-your-luck");
    if (!round) {
      return invalidCasinoAction();
    }

    const rollResult = advancePushYourLuckRound(round);
    if (rollResult.kind === "active") {
      nextSession = {
        ...nextSession,
        state: {
          ...nextSession.state,
          activeRound: rollResult.round,
          lastOutcome: `Rolled ${rollResult.round.rolls.at(-1) ?? rollResult.round.rolls[0]}. ${rollResult.round.uniqueValues.length} unique faces so far.`,
        },
      };
    } else if (rollResult.kind === "bust") {
      analytics.recordRoundCompleted({
        userId: action.ownerId,
        game: "push-your-luck",
        betTier: getDiceCasinoBetTier(round.bet),
        payout: 0,
        outcome: "loss",
      });
      nextSession = {
        ...nextSession,
        state: {
          ...nextSession.state,
          activeRound: null,
          lastOutcome: `Bust. You repeated ${rollResult.rolledValue} and lost the round.`,
        },
      };
    } else {
      nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: rollResult.payout });
      analytics.recordRoundCompleted({
        userId: action.ownerId,
        game: "push-your-luck",
        betTier: getDiceCasinoBetTier(round.bet),
        payout: rollResult.payout,
        outcome: getOutcomeFromPayout(round.bet, rollResult.payout),
      });
      nextSession = {
        ...nextSession,
        state: {
          ...nextSession.state,
          activeRound: null,
          lastOutcome: `Perfect run. Rolled ${rollResult.rolledValue} for 6 uniques and paid ${rollResult.payout} pips total.`,
        },
      };
    }

    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "push-cashout") {
    const round = getExpectedRound(nextSession.state.activeRound, "push-your-luck");
    if (!round || !canPushYourLuckCashOut(round)) {
      return invalidCasinoAction();
    }

    const payout = getPushYourLuckCashoutPayout(round.bet, round.uniqueValues.length);
    nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: payout });
    analytics.recordRoundCompleted({
      userId: action.ownerId,
      game: "push-your-luck",
      betTier: getDiceCasinoBetTier(round.bet),
      payout,
      outcome: getOutcomeFromPayout(round.bet, payout),
    });
    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        activeRound: null,
        lastOutcome: `Cashed out after ${round.uniqueValues.length} uniques for ${payout} pips total.`,
      },
    };
    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "blackjack-hit") {
    const round = getExpectedRound(nextSession.state.activeRound, "blackjack");
    if (!round) {
      return invalidCasinoAction();
    }

    const resolution = hitBlackjackRound(round);
    if (resolution.kind === "active") {
      nextSession = {
        ...nextSession,
        state: {
          ...nextSession.state,
          activeRound: resolution.round,
          lastOutcome: `You drew ${resolution.round.playerHand.at(-1) ?? resolution.round.playerHand[0]}.`,
        },
      };
    } else {
      if (resolution.payout > 0) {
        nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: resolution.payout });
      }
      analytics.recordRoundCompleted({
        userId: action.ownerId,
        game: "blackjack",
        betTier: getDiceCasinoBetTier(round.bet),
        payout: resolution.payout,
        outcome: getOutcomeFromPayout(round.bet, resolution.payout),
      });
      nextSession = {
        ...nextSession,
        state: {
          ...nextSession.state,
          activeRound: null,
          lastOutcome: `${resolution.summary} Dealer: ${formatDice(resolution.dealerHand)}. You: ${formatDice(
            resolution.playerHand,
          )}.`,
        },
      };
    }

    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "blackjack-stand") {
    const round = getExpectedRound(nextSession.state.activeRound, "blackjack");
    if (!round) {
      return invalidCasinoAction();
    }

    const resolution = standBlackjackRound(round);
    if (resolution.kind !== "resolved") {
      return invalidCasinoAction();
    }

    if (resolution.payout > 0) {
      nextPips = economy.applyPipsDelta({ userId: action.ownerId, amount: resolution.payout });
    }
    analytics.recordRoundCompleted({
      userId: action.ownerId,
      game: "blackjack",
      betTier: getDiceCasinoBetTier(round.bet),
      payout: resolution.payout,
      outcome: getOutcomeFromPayout(round.bet, resolution.payout),
    });
    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        activeRound: null,
        lastOutcome: `${resolution.summary} Dealer: ${formatDice(resolution.dealerHand)}. You: ${formatDice(
          resolution.playerHand,
        )}.`,
      },
    };
    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "poker-toggle-hold") {
    const round = getExpectedRound(nextSession.state.activeRound, "dice-poker");
    if (!round || action.index < 0 || action.index >= round.initialRoll.length) {
      return invalidCasinoAction();
    }

    const heldIndices = round.heldIndices.includes(action.index)
      ? round.heldIndices.filter((index) => index !== action.index)
      : [...round.heldIndices, action.index].sort((left, right) => left - right);
    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        activeRound: {
          ...round,
          heldIndices,
        },
      },
    };
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "poker-reroll") {
    const round = getExpectedRound(nextSession.state.activeRound, "dice-poker");
    if (!round) {
      return invalidCasinoAction();
    }

    const rerollResult = rerollDicePokerRound(round);
    if (rerollResult.result.payout > 0) {
      nextPips = economy.applyPipsDelta({
        userId: action.ownerId,
        amount: rerollResult.result.payout,
      });
    }
    analytics.recordRoundCompleted({
      userId: action.ownerId,
      game: "dice-poker",
      betTier: getDiceCasinoBetTier(round.bet),
      payout: rerollResult.result.payout,
      outcome: getOutcomeFromPayout(round.bet, rerollResult.result.payout),
    });
    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        activeRound: null,
        lastOutcome: `Final hand ${formatDice(rerollResult.finalRoll)}. ${describePokerResult(
          rerollResult.result,
        )}`,
      },
    };
    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  if (action.type === "poker-cancel") {
    const round = getExpectedRound(nextSession.state.activeRound, "dice-poker");
    if (!round) {
      return invalidCasinoAction();
    }

    analytics.recordRoundCompleted({
      userId: action.ownerId,
      game: "dice-poker",
      betTier: getDiceCasinoBetTier(round.bet),
      payout: 0,
      outcome: "loss",
    });
    nextSession = {
      ...nextSession,
      state: {
        ...nextSession.state,
        activeRound: null,
        lastOutcome: "Dice Poker hand cancelled. Bet forfeited.",
      },
    };
    nextSession = normalizeSessionBet(nextSession, nextPips);
    sessions.saveSession(nextSession);
    return {
      kind: "view",
      session: nextSession,
      pips: nextPips,
    };
  }

  return invalidCasinoAction();
};

const buildCasinoView = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction> => {
  const lines = [
    `**Dice casino for <@${session.userId}>**`,
    `Pips: ${pips}.`,
    `Bet: ${session.bet}.`,
    `Selected game: ${getDiceCasinoGameLabel(session.state.selectedGame)}.`,
    "All payouts are integer total returns including stake. Fractional theoretical payouts are rounded down in the house's favor.",
  ];

  if (session.state.lastOutcome) {
    lines.push("", `Last outcome: ${session.state.lastOutcome}`);
  }

  lines.push("", ...buildGameDescriptionLines(session));

  return {
    content: lines.join("\n"),
    components: buildCasinoComponents(session, pips),
  };
};

const buildGameDescriptionLines = (session: DiceCasinoSession): string[] => {
  if (session.state.selectedGame === "exact-roll") {
    return buildExactRollLines(session);
  }

  if (session.state.selectedGame === "push-your-luck") {
    return buildPushYourLuckLines(session);
  }

  if (session.state.selectedGame === "blackjack") {
    return buildBlackjackLines(session);
  }

  return buildDicePokerLines(session);
};

const buildExactRollLines = (session: DiceCasinoSession): string[] => {
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

const buildPushYourLuckLines = (session: DiceCasinoSession): string[] => {
  const lines = [
    "**Push Your Luck**",
    "Roll 1d6. If you repeat a face, you bust. Cash out from 2 uniques onward.",
    `2 uniques: ${getPushYourLuckCashoutPayout(session.bet, 2)} total.`,
    `3 uniques: ${getPushYourLuckCashoutPayout(session.bet, 3)} total.`,
    `4 uniques: ${getPushYourLuckCashoutPayout(session.bet, 4)} total.`,
    `5 uniques: ${getPushYourLuckCashoutPayout(session.bet, 5)} total.`,
    `6 uniques: ${getPushYourLuckCashoutPayout(session.bet, 6)} total.`,
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

const buildBlackjackLines = (session: DiceCasinoSession): string[] => {
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

const buildDicePokerLines = (session: DiceCasinoSession): string[] => {
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

const buildCasinoComponents = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction>["components"] => {
  const roundActive = Boolean(session.state.activeRound);
  const hasAffordableBet = canStartCasinoRound(session.bet, pips);
  const rows: ActionView<DiceCasinoAction>["components"] = [];

  const gameSelectionRow = gameButtonOrder.map<
    ActionView<DiceCasinoAction>["components"][number][number]
  >((game) => ({
    action: { type: "select-game", ownerId: session.userId, game } as const,
    label: getDiceCasinoGameLabel(game),
    style: session.state.selectedGame === game ? "primary" : "secondary",
    disabled: roundActive,
  }));
  gameSelectionRow.push({
    action: { type: "refresh", ownerId: session.userId },
    label: "Refresh",
    style: "secondary",
  });
  rows.push(gameSelectionRow);

  rows.push([
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "min" },
      label: "Min",
      style: "secondary",
      disabled: roundActive || pips < diceCasinoMinBet,
    },
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "-10" },
      label: "-10",
      style: "secondary",
      disabled: roundActive || pips < diceCasinoMinBet,
    },
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "-1" },
      label: "-1",
      style: "secondary",
      disabled: roundActive || pips < diceCasinoMinBet,
    },
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "+1" },
      label: "+1",
      style: "secondary",
      disabled: roundActive || pips < diceCasinoMinBet,
    },
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "+10" },
      label: "+10",
      style: "secondary",
      disabled: roundActive || pips < diceCasinoMinBet,
    },
  ]);

  rows.push([
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "max" },
      label: "Max",
      style: "secondary",
      disabled: roundActive || pips < diceCasinoMinBet,
    },
    {
      action: { type: "play", ownerId: session.userId },
      label: session.state.selectedGame === "exact-roll" ? "Use Bet Buttons" : "Play",
      style: "success",
      disabled: roundActive || !hasAffordableBet || session.state.selectedGame === "exact-roll",
    },
  ]);

  if (session.state.selectedGame === "exact-roll" && !roundActive) {
    rows.push([
      {
        action: { type: "exact-mode", ownerId: session.userId, mode: "exact-face" },
        label: "Exact Face",
        style: session.state.exactRollMode === "exact-face" ? "primary" : "secondary",
      },
      {
        action: { type: "exact-mode", ownerId: session.userId, mode: "high-low" },
        label: "High / Low",
        style: session.state.exactRollMode === "high-low" ? "primary" : "secondary",
      },
    ]);

    if (session.state.exactRollMode === "exact-face") {
      rows.push(
        Array.from({ length: 5 }, (_, index) => index + 1).map((face) => ({
          action: { type: "exact-face", ownerId: session.userId, face } as const,
          label: `${face}`,
          style: session.state.exactRollFace === face ? "primary" : "secondary",
          disabled: !hasAffordableBet,
        })),
      );
      rows.push([
        {
          action: { type: "exact-face", ownerId: session.userId, face: 6 },
          label: "6",
          style: session.state.exactRollFace === 6 ? "primary" : "secondary",
          disabled: !hasAffordableBet,
        },
      ]);
    } else {
      rows.push([
        {
          action: { type: "exact-high-low", ownerId: session.userId, choice: "low" },
          label: "Low (1-3)",
          style: session.state.exactRollHighLowChoice === "low" ? "primary" : "secondary",
          disabled: !hasAffordableBet,
        },
        {
          action: { type: "exact-high-low", ownerId: session.userId, choice: "high" },
          label: "High (4-6)",
          style: session.state.exactRollHighLowChoice === "high" ? "primary" : "secondary",
          disabled: !hasAffordableBet,
        },
      ]);
    }
  }

  const pushRound = getExpectedRound(session.state.activeRound, "push-your-luck");
  if (pushRound) {
    rows.push([
      {
        action: { type: "push-roll", ownerId: session.userId },
        label: "Roll",
        style: "primary",
      },
      {
        action: { type: "push-cashout", ownerId: session.userId },
        label: "Cash Out",
        style: "success",
        disabled: !canPushYourLuckCashOut(pushRound),
      },
    ]);
  }

  const blackjackRound = getExpectedRound(session.state.activeRound, "blackjack");
  if (blackjackRound) {
    rows.push([
      {
        action: { type: "blackjack-hit", ownerId: session.userId },
        label: "Hit",
        style: "primary",
      },
      {
        action: { type: "blackjack-stand", ownerId: session.userId },
        label: "Stand",
        style: "success",
      },
    ]);
  }

  const pokerRound = getExpectedRound(session.state.activeRound, "dice-poker");
  if (pokerRound) {
    rows.push(
      pokerRound.initialRoll.map((_, index) => ({
        action: { type: "poker-toggle-hold", ownerId: session.userId, index } as const,
        label: pokerRound.heldIndices.includes(index)
          ? `Release ${index + 1}`
          : `Hold ${index + 1}`,
        style: pokerRound.heldIndices.includes(index) ? "danger" : "secondary",
      })),
    );
    rows.push([
      {
        action: { type: "poker-reroll", ownerId: session.userId },
        label: "Reroll",
        style: "success",
      },
      {
        action: { type: "poker-cancel", ownerId: session.userId },
        label: "Cancel",
        style: "danger",
      },
    ]);
  }

  return rows;
};

const resolveInitialBet = (
  requestedBet: number | null,
  availablePips: number,
): { ok: true; bet: number } | { ok: false; message: string } => {
  if (availablePips < diceCasinoMinBet) {
    return {
      ok: false,
      message: "You need at least 1 pip to open the casino.",
    };
  }

  if (requestedBet !== null) {
    if (requestedBet > availablePips) {
      return {
        ok: false,
        message: `You need ${requestedBet} pips to use that bet. Current balance: ${availablePips} pips.`,
      };
    }

    return {
      ok: true,
      bet: clampDiceCasinoBet(requestedBet),
    };
  }

  return {
    ok: true,
    bet: availablePips >= diceCasinoDefaultBet ? diceCasinoDefaultBet : availablePips,
  };
};

const createSessionRecord = (userId: string, bet: number, nowMs: number): DiceCasinoSession => {
  return {
    userId,
    bet,
    state: createDefaultDiceCasinoSessionState(),
    expiresAt: new Date(nowMs + diceCasinoSessionTimeoutMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };
};

const refreshSession = (session: DiceCasinoSession, nowMs: number): DiceCasinoSession => {
  return {
    ...session,
    expiresAt: new Date(nowMs + diceCasinoSessionTimeoutMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };
};

const normalizeSessionBet = (session: DiceCasinoSession, pips: number): DiceCasinoSession => {
  if (session.state.activeRound || pips < diceCasinoMinBet) {
    return session;
  }

  return {
    ...session,
    bet: clampBetToBalance(session.bet, pips),
  };
};

const clampBetToBalance = (bet: number, pips: number): number => {
  if (pips < diceCasinoMinBet) {
    return diceCasinoMinBet;
  }

  return Math.max(diceCasinoMinBet, Math.min(clampDiceCasinoBet(bet), pips));
};

const adjustSessionBet = (
  bet: number,
  adjustment: Extract<DiceCasinoAction, { type: "adjust-bet" }>["adjustment"],
  availablePips: number,
): number => {
  const maxAffordable = Math.max(diceCasinoMinBet, Math.min(diceCasinoMaxBet, availablePips));
  const stepMap = {
    min: diceCasinoMinBet,
    max: maxAffordable,
    "-10": bet - 10,
    "-1": bet - 1,
    "+1": bet + 1,
    "+10": bet + 10,
  } as const;

  return Math.max(diceCasinoMinBet, Math.min(maxAffordable, stepMap[adjustment]));
};

const getExpectedRound = <TRoundType extends DiceCasinoActiveRound["type"]>(
  round: DiceCasinoActiveRound | null,
  type: TRoundType,
): Extract<DiceCasinoActiveRound, { type: TRoundType }> | null => {
  if (!round || round.type !== type) {
    return null;
  }

  return round as Extract<DiceCasinoActiveRound, { type: TRoundType }>;
};

const canStartCasinoRound = (bet: number, pips: number): boolean => {
  return pips >= bet && bet >= diceCasinoMinBet;
};

const getOutcomeFromPayout = (bet: number, payout: number): "win" | "loss" | "push" => {
  if (payout === 0) {
    return "loss";
  }

  if (payout === bet) {
    return "push";
  }

  return "win";
};

const insufficientPipsReply = (bet: number, pips: number): MutateSessionResult => {
  return {
    kind: "reply",
    content: `You need ${bet} pips to play that round. Current balance: ${pips} pips.`,
    ephemeral: true,
  };
};

const invalidCasinoAction = (): MutateSessionResult => {
  return {
    kind: "reply",
    content: "That casino action is not available right now.",
    ephemeral: true,
  };
};

const replyMessage = (content: string, ephemeral: boolean): DiceCasinoResult => {
  return {
    kind: "reply",
    payload: {
      type: "message",
      content,
      ephemeral,
    },
  };
};

const capitalize = (value: string): string => {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};
