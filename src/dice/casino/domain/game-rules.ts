import { getDiceCasinoData } from "../../../rolly-data/load";
import type {
  BlackjackRoundState,
  DiceCasinoGame,
  DicePokerRoundState,
  ExactRollHighLowChoice,
  PushYourLuckRoundState,
} from "./casino-session";

export type DiceCasinoBetTier = string;

export type DicePokerHandKind = "five-of-a-kind" | "four-of-a-kind" | "full-house" | "straight";

export type DicePokerResult =
  | {
      kind: DicePokerHandKind;
      payout: number;
    }
  | {
      kind: "loss";
      payout: 0;
    };

export type BlackjackResolution =
  | {
      kind: "active";
      round: BlackjackRoundState;
    }
  | {
      kind: "resolved";
      payout: number;
      summary: string;
      dealerHand: number[];
      playerHand: number[];
    };

const minuteMs = 60_000;

const getCasinoBetConfig = () => {
  return getDiceCasinoData().bet;
};

const getExactRollConfig = () => {
  return getDiceCasinoData().exactRoll;
};

const getPushYourLuckConfig = () => {
  return getDiceCasinoData().pushYourLuck;
};

const getBlackjackConfig = () => {
  return getDiceCasinoData().blackjack;
};

const getDicePokerConfig = () => {
  return getDiceCasinoData().dicePoker;
};

const applyPayoutRatio = (
  bet: number,
  payout: {
    numerator: number;
    denominator: number;
  },
): number => {
  return Math.floor((payout.numerator * bet) / payout.denominator);
};

export const getDiceCasinoMinBet = (): number => {
  return getCasinoBetConfig().min;
};

export const getDiceCasinoMaxBet = (): number => {
  return getCasinoBetConfig().max;
};

export const getDiceCasinoDefaultBet = (): number => {
  return getCasinoBetConfig().default;
};

export const getDiceCasinoSessionTimeoutMs = (): number => {
  return getCasinoBetConfig().sessionTimeoutMinutes * minuteMs;
};

export const getDiceCasinoBetTier = (bet: number): DiceCasinoBetTier => {
  return String(clampDiceCasinoBet(bet));
};

export const clampDiceCasinoBet = (bet: number): number => {
  return Math.max(getDiceCasinoMinBet(), Math.min(getDiceCasinoMaxBet(), Math.floor(bet)));
};

export const getDiceCasinoGameLabel = (game: DiceCasinoGame): string => {
  switch (game) {
    case "exact-roll":
      return "Exact Roll";
    case "push-your-luck":
      return "Push Your Luck";
    case "blackjack":
      return "Blackjack";
    case "dice-poker":
      return "Dice Poker";
  }
};

export const rollDie = (sides: number): number => {
  return Math.floor(Math.random() * sides) + 1;
};

export const rollDice = (count: number, sides: number): number[] => {
  return Array.from({ length: count }, () => rollDie(sides));
};

export const getExactRollDieSides = (): number => {
  return getExactRollConfig().dieSides;
};

export const getExactRollLowMaxFace = (): number => {
  return getExactRollConfig().highLowLowMaxFace;
};

export const getExactRollHighMinFace = (): number => {
  return getExactRollLowMaxFace() + 1;
};

export const getExactRollFacePayoutRatio = () => {
  return getExactRollConfig().facePayout;
};

export const getExactRollHighLowPayoutRatio = () => {
  return getExactRollConfig().highLowPayout;
};

export const getExactRollFacePayout = (bet: number): number => {
  return applyPayoutRatio(bet, getExactRollFacePayoutRatio());
};

export const getExactRollHighLowPayout = (bet: number): number => {
  return applyPayoutRatio(bet, getExactRollHighLowPayoutRatio());
};

export const resolveExactRollFace = (
  bet: number,
  chosenFace: number,
  rolledFace: number,
): { payout: number; won: boolean } => {
  return {
    payout: chosenFace === rolledFace ? getExactRollFacePayout(bet) : 0,
    won: chosenFace === rolledFace,
  };
};

export const resolveExactRollHighLow = (
  bet: number,
  choice: ExactRollHighLowChoice,
  rolledFace: number,
): { payout: number; won: boolean } => {
  const resultChoice: ExactRollHighLowChoice =
    rolledFace <= getExactRollLowMaxFace() ? "low" : "high";
  return {
    payout: resultChoice === choice ? getExactRollHighLowPayout(bet) : 0,
    won: resultChoice === choice,
  };
};

export const getPushYourLuckDieSides = (): number => {
  return getPushYourLuckConfig().dieSides;
};

export const getPushYourLuckCashoutStartUniqueFaces = (): number => {
  return getPushYourLuckConfig().cashoutStartsAtUniqueFaces;
};

export const getPushYourLuckAutoCashoutAtUniqueFaces = (): number => {
  return getPushYourLuckConfig().autoCashoutAtUniqueFaces;
};

export const getPushYourLuckPayoutTable = () => {
  return getPushYourLuckConfig().payouts;
};

export const createPushYourLuckRound = (bet: number): PushYourLuckRoundState => {
  const firstRoll = rollDie(getPushYourLuckDieSides());
  return {
    type: "push-your-luck",
    bet,
    rolls: [firstRoll],
    uniqueValues: [firstRoll],
  };
};

export const canPushYourLuckCashOut = (round: PushYourLuckRoundState): boolean => {
  return round.uniqueValues.length >= getPushYourLuckCashoutStartUniqueFaces();
};

export const getPushYourLuckCashoutPayout = (bet: number, uniqueCount: number): number => {
  const payout = getPushYourLuckPayoutTable().find((entry) => entry.uniqueFaces === uniqueCount);
  if (!payout) {
    throw new Error(`Missing Push Your Luck payout for ${uniqueCount} unique faces.`);
  }

  return applyPayoutRatio(bet, payout);
};

export const advancePushYourLuckRound = (
  round: PushYourLuckRoundState,
):
  | {
      kind: "active";
      round: PushYourLuckRoundState;
    }
  | {
      kind: "bust";
      rolledValue: number;
    }
  | {
      kind: "auto-cashout";
      rolledValue: number;
      payout: number;
    } => {
  const rolledValue = rollDie(getPushYourLuckDieSides());
  if (round.uniqueValues.includes(rolledValue)) {
    return {
      kind: "bust",
      rolledValue,
    };
  }

  const nextRound: PushYourLuckRoundState = {
    ...round,
    rolls: [...round.rolls, rolledValue],
    uniqueValues: [...round.uniqueValues, rolledValue],
  };

  if (nextRound.uniqueValues.length >= getPushYourLuckAutoCashoutAtUniqueFaces()) {
    return {
      kind: "auto-cashout",
      rolledValue,
      payout: getPushYourLuckCashoutPayout(round.bet, nextRound.uniqueValues.length),
    };
  }

  return {
    kind: "active",
    round: nextRound,
  };
};

export const getBlackjackDieSides = (): number => {
  return getBlackjackConfig().dieSides;
};

export const getBlackjackInitialCardsPerHand = (): number => {
  return getBlackjackConfig().initialCardsPerHand;
};

export const getBlackjackDealerStandOnTotal = (): number => {
  return getBlackjackConfig().dealerStandOnTotal;
};

export const getBlackjackNaturalPayoutRatio = () => {
  return getBlackjackConfig().naturalPayout;
};

export const getBlackjackWinPayoutMultiplier = (): number => {
  return getBlackjackConfig().winPayoutMultiplier;
};

const getBlackjackWinPayout = (bet: number): number => {
  return bet * getBlackjackWinPayoutMultiplier();
};

export const createBlackjackRound = (bet: number): BlackjackRoundState => {
  return {
    type: "blackjack",
    bet,
    playerHand: rollDice(getBlackjackInitialCardsPerHand(), getBlackjackDieSides()),
    dealerHand: rollDice(getBlackjackInitialCardsPerHand(), getBlackjackDieSides()),
    status: "active",
  };
};

type BlackjackHandTotals = {
  total: number;
  isSoft: boolean;
};

export const getBlackjackHandTotals = (hand: number[]): BlackjackHandTotals => {
  let baseTotal = 0;
  let aces = 0;

  for (const card of hand) {
    if (card === 1) {
      baseTotal += 1;
      aces += 1;
    } else {
      baseTotal += card;
    }
  }

  let total = baseTotal;
  let isSoft = false;
  while (aces > 0 && total + 10 <= 21) {
    total += 10;
    aces -= 1;
    isSoft = true;
  }

  return {
    total,
    isSoft,
  };
};

export const isBlackjackNatural = (hand: number[]): boolean => {
  return hand.length === getBlackjackInitialCardsPerHand() && getBlackjackHandTotals(hand).total === 21;
};

export const getBlackjackNaturalPayout = (bet: number): number => {
  return applyPayoutRatio(bet, getBlackjackNaturalPayoutRatio());
};

export const resolveBlackjackOpening = (round: BlackjackRoundState): BlackjackResolution => {
  const playerNatural = isBlackjackNatural(round.playerHand);
  const dealerNatural = isBlackjackNatural(round.dealerHand);

  if (playerNatural && dealerNatural) {
    return {
      kind: "resolved",
      payout: round.bet,
      summary: "Both you and the dealer opened with natural 21. Push.",
      dealerHand: round.dealerHand,
      playerHand: round.playerHand,
    };
  }

  if (dealerNatural) {
    return {
      kind: "resolved",
      payout: 0,
      summary: "Dealer natural 21. You lose.",
      dealerHand: round.dealerHand,
      playerHand: round.playerHand,
    };
  }

  if (playerNatural) {
    return {
      kind: "resolved",
      payout: getBlackjackNaturalPayout(round.bet),
      summary: `Natural 21. You win ${getBlackjackNaturalPayout(round.bet)} pips total.`,
      dealerHand: round.dealerHand,
      playerHand: round.playerHand,
    };
  }

  return {
    kind: "active",
    round,
  };
};

const drawBlackjackDealerToCompletion = (dealerHand: number[]): number[] => {
  const nextHand = [...dealerHand];
  while (true) {
    const totals = getBlackjackHandTotals(nextHand);
    if (totals.total >= getBlackjackDealerStandOnTotal()) {
      return nextHand;
    }

    nextHand.push(rollDie(getBlackjackDieSides()));
  }
};

export const hitBlackjackRound = (round: BlackjackRoundState): BlackjackResolution => {
  const nextRound: BlackjackRoundState = {
    ...round,
    playerHand: [...round.playerHand, rollDie(getBlackjackDieSides())],
  };
  const playerTotals = getBlackjackHandTotals(nextRound.playerHand);

  if (playerTotals.total > 21) {
    return {
      kind: "resolved",
      payout: 0,
      summary: `Bust with ${playerTotals.total}. You lose.`,
      dealerHand: round.dealerHand,
      playerHand: nextRound.playerHand,
    };
  }

  if (playerTotals.total === 21) {
    return standBlackjackRound(nextRound);
  }

  return {
    kind: "active",
    round: nextRound,
  };
};

export const standBlackjackRound = (round: BlackjackRoundState): BlackjackResolution => {
  const dealerHand = drawBlackjackDealerToCompletion(round.dealerHand);
  const playerTotals = getBlackjackHandTotals(round.playerHand);
  const dealerTotals = getBlackjackHandTotals(dealerHand);

  if (dealerTotals.total > 21 || playerTotals.total > dealerTotals.total) {
    const payout = getBlackjackWinPayout(round.bet);
    return {
      kind: "resolved",
      payout,
      summary: `You win ${payout} pips total. Dealer ${dealerTotals.total}, you ${playerTotals.total}.`,
      dealerHand,
      playerHand: round.playerHand,
    };
  }

  if (playerTotals.total === dealerTotals.total) {
    return {
      kind: "resolved",
      payout: round.bet,
      summary: `Push at ${playerTotals.total}. You get ${round.bet} pips back.`,
      dealerHand,
      playerHand: round.playerHand,
    };
  }

  return {
    kind: "resolved",
    payout: 0,
    summary: `Dealer wins ${dealerTotals.total} to ${playerTotals.total}.`,
    dealerHand,
    playerHand: round.playerHand,
  };
};

export const getDicePokerDiceCount = (): number => {
  return getDicePokerConfig().diceCount;
};

export const getDicePokerDieSides = (): number => {
  return getDicePokerConfig().dieSides;
};

export const getDicePokerPayoutMultiplier = (kind: DicePokerHandKind): number => {
  const multipliers = getDicePokerConfig().payoutMultipliers;
  switch (kind) {
    case "five-of-a-kind":
      return multipliers.fiveOfAKind;
    case "four-of-a-kind":
      return multipliers.fourOfAKind;
    case "full-house":
      return multipliers.fullHouse;
    case "straight":
      return multipliers.straight;
  }
};

export const createDicePokerRound = (bet: number): DicePokerRoundState => {
  return {
    type: "dice-poker",
    bet,
    initialRoll: rollDice(getDicePokerDiceCount(), getDicePokerDieSides()),
    heldIndices: [],
    stage: "holding",
  };
};

export const rerollDicePokerRound = (
  round: DicePokerRoundState,
): { finalRoll: number[]; result: DicePokerResult } => {
  const finalRoll = round.initialRoll.map((value, index) =>
    round.heldIndices.includes(index) ? value : rollDie(getDicePokerDieSides()),
  );
  return {
    finalRoll,
    result: classifyDicePokerHand(finalRoll, round.bet),
  };
};

export const classifyDicePokerHand = (roll: number[], bet: number): DicePokerResult => {
  const counts = new Map<number, number>();
  for (const value of roll) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const groups = [...counts.values()].sort((left, right) => right - left);
  const uniqueValues = [...counts.keys()].sort((left, right) => left - right);
  const isStraight =
    uniqueValues.length === getDicePokerDiceCount() &&
    uniqueValues.at(-1)! - uniqueValues[0]! === getDicePokerDiceCount() - 1;

  if (groups[0] === getDicePokerDiceCount()) {
    return {
      kind: "five-of-a-kind",
      payout: bet * getDicePokerPayoutMultiplier("five-of-a-kind"),
    };
  }

  if (groups[0] === getDicePokerDiceCount() - 1) {
    return {
      kind: "four-of-a-kind",
      payout: bet * getDicePokerPayoutMultiplier("four-of-a-kind"),
    };
  }

  if (groups[0] === 3 && groups[1] === 2) {
    return {
      kind: "full-house",
      payout: bet * getDicePokerPayoutMultiplier("full-house"),
    };
  }

  if (isStraight) {
    return {
      kind: "straight",
      payout: bet * getDicePokerPayoutMultiplier("straight"),
    };
  }

  return { kind: "loss", payout: 0 };
};

export const formatDice = (dice: number[]): string => {
  return dice.map((value) => `[${value}]`).join(" ");
};

export const formatBlackjackDice = (dice: number[], hideHoleCard: boolean): string => {
  return dice.map((value, index) => (hideHoleCard && index === 1 ? "[?]" : `[${value}]`)).join(" ");
};

export const describePokerResult = (result: DicePokerResult): string => {
  switch (result.kind) {
    case "five-of-a-kind":
      return `Five of a Kind for ${result.payout} pips total.`;
    case "four-of-a-kind":
      return `Four of a Kind for ${result.payout} pips total.`;
    case "full-house":
      return `Full House for ${result.payout} pips total.`;
    case "straight":
      return `Straight for ${result.payout} pips total.`;
    case "loss":
      return "No paying hand. You lose.";
  }
};
