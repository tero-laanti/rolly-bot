import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import type { DiceAnalyticsDashboardView } from "../../../application/query-dashboard/use-case";

export const renderDiceAnalyticsResult = (view: DiceAnalyticsDashboardView): InteractionResult => {
  return {
    kind: "reply",
    payload: {
      content: renderDiceAnalyticsContent(view),
      ephemeral: view.ephemeral,
    },
  };
};

const renderDiceAnalyticsContent = (view: DiceAnalyticsDashboardView): string => {
  const lines = [view.title];

  for (const [index, section] of view.sections.entries()) {
    if (index > 0) {
      lines.push("");
    }

    if (section.heading) {
      lines.push(`${section.heading}:`);
    }

    lines.push(...section.lines);
  }

  return lines.join("\n");
};
