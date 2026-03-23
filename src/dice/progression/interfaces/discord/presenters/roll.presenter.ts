import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import type { DiceRollResult } from "../../../application/roll/use-case";

export const renderDiceRollResult = (result: DiceRollResult): InteractionResult => {
  return {
    kind: "reply",
    payload: {
      content: result.content,
      ephemeral: result.ephemeral,
    },
  };
};
