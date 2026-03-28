import type { ContractCompletionAnnouncement } from "../../dice/contracts/application/completion-announcements";
import type { AchievementAnnouncement } from "../../dice/progression/application/achievement-announcements";
import {
  createRenderedInteractionResult,
  type InteractionResult,
  type RenderedInteractionResult,
} from "./interaction-response";
import { renderActionButtonRows } from "./render-action-button-rows";
import type { ActionResult, ActionView } from "../../shared-kernel/application/action-view";

type ActionResultWithAchievements<TAction> = ActionResult<TAction> & {
  achievementAnnouncements?: AchievementAnnouncement[];
  contractCompletionAnnouncements?: ContractCompletionAnnouncement[];
};

export const renderActionView = <TAction>(
  view: ActionView<TAction>,
  encodeAction: (action: TAction) => string,
): InteractionResult["payload"] => {
  return {
    content: view.content,
    components: renderActionButtonRows(view.components, encodeAction),
  };
};

export const renderActionResult = <TAction>(
  result: ActionResultWithAchievements<TAction>,
  encodeAction: (action: TAction) => string,
): RenderedInteractionResult => {
  let interactionResult: InteractionResult;

  if (result.payload.type === "message") {
    if (result.kind === "reply") {
      interactionResult = {
        kind: "reply",
        payload: {
          content: result.payload.content,
          ephemeral: result.payload.ephemeral,
        },
      };
    } else {
      interactionResult = {
        kind: result.kind,
        payload: {
          content: result.payload.content,
          components: result.payload.clearComponents ? [] : undefined,
        },
      };
    }
  } else if (result.kind === "reply") {
    interactionResult = {
      kind: "reply",
      payload: {
        ...renderActionView(result.payload.view, encodeAction),
        ephemeral: result.payload.ephemeral,
      },
    };
  } else {
    interactionResult = {
      kind: result.kind,
      payload: renderActionView(result.payload.view, encodeAction),
    };
  }

  return createRenderedInteractionResult(
    interactionResult,
    result.achievementAnnouncements ?? [],
    result.contractCompletionAnnouncements ?? [],
  );
};
