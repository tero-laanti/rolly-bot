export type DiceCasinoGame = "exact-roll" | "push-your-luck" | "blackjack" | "dice-poker";

export type ExactRollMode = "exact-face" | "high-low";

export type ExactRollHighLowChoice = "low" | "high";

export type PushYourLuckRoundState = {
  type: "push-your-luck";
  bet: number;
  rolls: number[];
  uniqueValues: number[];
};

export type BlackjackRoundState = {
  type: "blackjack";
  bet: number;
  playerHand: number[];
  dealerHand: number[];
  status: "active";
};

export type DicePokerRoundState = {
  type: "dice-poker";
  bet: number;
  initialRoll: number[];
  heldIndices: number[];
  stage: "holding";
};

export type DiceCasinoActiveRound =
  | PushYourLuckRoundState
  | BlackjackRoundState
  | DicePokerRoundState;

export type DiceCasinoSessionState = {
  selectedGame: DiceCasinoGame;
  exactRollMode: ExactRollMode;
  exactRollFace: number;
  exactRollHighLowChoice: ExactRollHighLowChoice;
  activeRound: DiceCasinoActiveRound | null;
  lastOutcome: string | null;
};

export type DiceCasinoSession = {
  userId: string;
  bet: number;
  state: DiceCasinoSessionState;
  expiresAt: string;
  updatedAt: string;
};

export const createDefaultDiceCasinoSessionState = (): DiceCasinoSessionState => {
  return {
    selectedGame: "exact-roll",
    exactRollMode: "exact-face",
    exactRollFace: 1,
    exactRollHighLowChoice: "low",
    activeRound: null,
    lastOutcome: null,
  };
};
