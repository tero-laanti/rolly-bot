import type { ActionView } from "../../../../shared-kernel/application/action-view";
import { getDiceCasinoGameLabel, getDiceCasinoMinBet } from "../../domain/game-rules";
import { canStartCasinoRound } from "./helpers";
import { diceCasinoGameButtonOrder, getDiceCasinoGameModule } from "./games";
import type { DiceCasinoAction, DiceCasinoActionRow } from "./types";
import type { DiceCasinoSession } from "../../domain/casino-session";

export const buildCasinoView = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction> => {
  const gameModule = getDiceCasinoGameModule(session.state.selectedGame);
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

  lines.push("", ...gameModule.buildDescriptionLines(session));

  return {
    content: lines.join("\n"),
    components: buildCasinoComponents(session, pips),
  };
};

const buildCasinoComponents = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction>["components"] => {
  const roundActive = Boolean(session.state.activeRound);
  const hasAffordableBet = canStartCasinoRound(session.bet, pips);
  const rows: ActionView<DiceCasinoAction>["components"] = [];

  const gameSelectionRow: DiceCasinoActionRow = diceCasinoGameButtonOrder.map((game) => ({
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
      disabled: roundActive || pips < getDiceCasinoMinBet(),
    },
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "-10" },
      label: "-10",
      style: "secondary",
      disabled: roundActive || pips < getDiceCasinoMinBet(),
    },
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "-1" },
      label: "-1",
      style: "secondary",
      disabled: roundActive || pips < getDiceCasinoMinBet(),
    },
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "+1" },
      label: "+1",
      style: "secondary",
      disabled: roundActive || pips < getDiceCasinoMinBet(),
    },
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "+10" },
      label: "+10",
      style: "secondary",
      disabled: roundActive || pips < getDiceCasinoMinBet(),
    },
  ]);

  rows.push([
    {
      action: { type: "adjust-bet", ownerId: session.userId, adjustment: "max" },
      label: "Max",
      style: "secondary",
      disabled: roundActive || pips < getDiceCasinoMinBet(),
    },
    {
      action: { type: "play", ownerId: session.userId },
      label: session.state.selectedGame === "exact-roll" ? "Use Bet Buttons" : "Play",
      style: "success",
      disabled: roundActive || !hasAffordableBet || session.state.selectedGame === "exact-roll",
    },
  ]);

  rows.push(
    ...getDiceCasinoGameModule(session.state.selectedGame).buildComponentRows({
      session,
      pips,
      hasAffordableBet,
      roundActive,
    }),
  );

  return rows;
};
