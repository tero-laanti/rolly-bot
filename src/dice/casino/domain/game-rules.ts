import type {
  BlackjackRoundState,
  DiceCasinoGame,
  DicePokerRoundState,
  ExactRollHighLowChoice,
  PushYourLuckRoundState,
} from "./casino-session";

export type DiceCasinoBetTier = "1-5" | "6-10" | "11-20" | "21-50";

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

export const diceCasinoMinBet = 1;
export const diceCasinoMaxBet = 50;
export const diceCasinoDefaultBet = 5;
export const diceCasinoSessionTimeoutMs = 5 * 60 * 1000;

export const getDiceCasinoBetTier = (bet: number): DiceCasinoBetTier => {
  if (bet <= 5) {
    return "1-5";
  }

  if (bet <= 10) {
    return "6-10";
  }

  if (bet <= 20) {
    return "11-20";
  }

  return "21-50";
};

export const clampDiceCasinoBet = (bet: number): number => {
  return Math.max(diceCasinoMinBet, Math.min(diceCasinoMaxBet, Math.floor(bet)));
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

export const getExactRollFacePayout = (bet: number): number => {
  return Math.floor((59 * bet) / 10);
};

export const getExactRollHighLowPayout = (bet: number): number => {
  return Math.floor((197 * bet) / 100);
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
  const resultChoice: ExactRollHighLowChoice = rolledFace <= 3 ? "low" : "high";
  return {
    payout: resultChoice === choice ? getExactRollHighLowPayout(bet) : 0,
    won: resultChoice === choice,
  };
};

const pushYourLuckPayoutNumerators: Record<number, number> = {
  2: 59,
  3: 177,
  4: 177,
  5: 531,
  6: 1593,
};

const pushYourLuckPayoutDenominators: Record<number, number> = {
  2: 50,
  3: 100,
  4: 50,
  5: 50,
  6: 25,
};

export const createPushYourLuckRound = (bet: number): PushYourLuckRoundState => {
  const firstRoll = rollDie(6);
  return {
    type: "push-your-luck",
    bet,
    rolls: [firstRoll],
    uniqueValues: [firstRoll],
  };
};

export const canPushYourLuckCashOut = (round: PushYourLuckRoundState): boolean => {
  return round.uniqueValues.length >= 2;
};

export const getPushYourLuckCashoutPayout = (bet: number, uniqueCount: number): number => {
  return Math.floor(
    (pushYourLuckPayoutNumerators[uniqueCount] * bet) / pushYourLuckPayoutDenominators[uniqueCount],
  );
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
  const rolledValue = rollDie(6);
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

  if (nextRound.uniqueValues.length >= 6) {
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

export const createBlackjackRound = (bet: number): BlackjackRoundState => {
  return {
    type: "blackjack",
    bet,
    playerHand: [rollDie(10), rollDie(10)],
    dealerHand: [rollDie(10), rollDie(10)],
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
  return hand.length === 2 && getBlackjackHandTotals(hand).total === 21;
};

export const getBlackjackNaturalPayout = (bet: number): number => {
  return Math.floor((11 * bet) / 5);
};

export const resolveBlackjackOpening = (round: BlackjackRoundState): BlackjackResolution => {
  const playerNatural = isBlackjackNatural(round.playerHand);
  const dealerNatural = isBlackjackNatural(round.dealerHand);

  if (playerNatural && dealerNatural) {
    return {
      kind: "resolved",
      payout: round.bet,
      summary: `Both you and the dealer opened with natural 21. Push.`,
      dealerHand: round.dealerHand,
      playerHand: round.playerHand,
    };
  }

  if (dealerNatural) {
    return {
      kind: "resolved",
      payout: 0,
      summary: `Dealer natural 21. You lose.`,
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
    if (totals.total >= 17) {
      return nextHand;
    }

    nextHand.push(rollDie(10));
  }
};

export const hitBlackjackRound = (round: BlackjackRoundState): BlackjackResolution => {
  const nextRound: BlackjackRoundState = {
    ...round,
    playerHand: [...round.playerHand, rollDie(10)],
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
    return {
      kind: "resolved",
      payout: round.bet * 2,
      summary: `You win ${round.bet * 2} pips total. Dealer ${dealerTotals.total}, you ${playerTotals.total}.`,
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

export const createDicePokerRound = (bet: number): DicePokerRoundState => {
  return {
    type: "dice-poker",
    bet,
    initialRoll: rollDice(5, 8),
    heldIndices: [],
    stage: "holding",
  };
};

export const rerollDicePokerRound = (
  round: DicePokerRoundState,
): { finalRoll: number[]; result: DicePokerResult } => {
  const finalRoll = round.initialRoll.map((value, index) =>
    round.heldIndices.includes(index) ? value : rollDie(8),
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
  const isStraight = uniqueValues.length === 5 && uniqueValues[4] - uniqueValues[0] === 4;

  if (groups[0] === 5) {
    return { kind: "five-of-a-kind", payout: bet * 20 };
  }

  if (groups[0] === 4) {
    return { kind: "four-of-a-kind", payout: bet * 10 };
  }

  if (groups[0] === 3 && groups[1] === 2) {
    return { kind: "full-house", payout: bet * 3 };
  }

  if (isStraight) {
    return { kind: "straight", payout: bet * 3 };
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
