import type { DiceCasinoGame } from "../../../domain/casino-session";
import type {
  DiceCasinoAction,
  DiceCasinoGameModule,
  DiceCasinoMutationContext,
  MutateSessionResult,
} from "../types";
import { blackjackGameModule } from "./blackjack";
import { dicePokerGameModule } from "./dice-poker";
import { exactRollGameModule } from "./exact-roll";
import { pushYourLuckGameModule } from "./push-your-luck";

export const diceCasinoGameButtonOrder: DiceCasinoGame[] = [
  "exact-roll",
  "push-your-luck",
  "blackjack",
  "dice-poker",
];

const diceCasinoGameModules: Record<DiceCasinoGame, DiceCasinoGameModule> = {
  "exact-roll": exactRollGameModule,
  "push-your-luck": pushYourLuckGameModule,
  blackjack: blackjackGameModule,
  "dice-poker": dicePokerGameModule,
};

export const getDiceCasinoGameModule = (game: DiceCasinoGame): DiceCasinoGameModule => {
  return diceCasinoGameModules[game];
};

export const handleDiceCasinoGameAction = (
  context: DiceCasinoMutationContext,
  action: DiceCasinoAction,
): MutateSessionResult | null => {
  for (const game of diceCasinoGameButtonOrder) {
    const result = diceCasinoGameModules[game].handleAction(context, action);
    if (result) {
      return result;
    }
  }

  return null;
};
