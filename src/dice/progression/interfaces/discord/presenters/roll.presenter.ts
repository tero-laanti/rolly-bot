import {
  createRenderedInteractionResult,
  type RenderedInteractionResult,
} from "../../../../../app/discord/interaction-response";
import type { DiceRollResult } from "../../../application/roll/use-case";

export const renderDiceRollResult = (result: DiceRollResult): RenderedInteractionResult => {
  return createRenderedInteractionResult(
    {
      kind: "reply",
      payload: {
        content: result.content,
        ephemeral: result.ephemeral,
      },
    },
    result.achievementAnnouncements ?? [],
    result.contractCompletionAnnouncements ?? [],
  );
};
