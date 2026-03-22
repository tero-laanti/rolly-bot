import { randomUUID } from "node:crypto";

export type DiceCasinoGame = "exact-roll" | "push-your-luck" | "blackjack" | "dice-poker";

export type ExactRollMode = "exact-face" | "high-low";

export type ExactRollHighLowChoice = "low" | "high";

export type DiceCasinoScreen = "lobby" | "setup" | "rules" | "result";

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
  sessionToken: string;
  allowLegacyActions: boolean;
  currentScreen: DiceCasinoScreen;
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

export const createDiceCasinoSessionToken = (): string => randomUUID();

export const createDefaultDiceCasinoSessionState = (
  sessionToken: string = createDiceCasinoSessionToken(),
): DiceCasinoSessionState => {
  return {
    sessionToken,
    allowLegacyActions: false,
    currentScreen: "lobby",
    selectedGame: "exact-roll",
    exactRollMode: "exact-face",
    exactRollFace: 1,
    exactRollHighLowChoice: "low",
    activeRound: null,
    lastOutcome: null,
  };
};

export const normalizeDiceCasinoSessionState = (
  state: Partial<DiceCasinoSessionState> | null | undefined,
): DiceCasinoSessionState => {
  const parsedState = typeof state === "object" && state ? state : {};
  const hasSessionToken =
    typeof parsedState.sessionToken === "string" && parsedState.sessionToken.length > 0;
  const sessionToken = hasSessionToken
    ? (parsedState.sessionToken as string)
    : createDiceCasinoSessionToken();
  const allowLegacyActions =
    typeof parsedState.allowLegacyActions === "boolean"
      ? parsedState.allowLegacyActions
      : !hasSessionToken;

  return {
    ...createDefaultDiceCasinoSessionState(sessionToken),
    ...parsedState,
    sessionToken,
    allowLegacyActions,
  };
};
