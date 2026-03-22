import {
  chunkActionButtons,
  type ActionButtonSpec,
  type ActionView,
} from "../../../../shared-kernel/application/action-view";
import {
  canPushYourLuckCashOut,
  dicePokerDiceCount,
  dicePokerDieSides,
  formatBlackjackDice,
  formatDice,
  getBlackjackHandTotals,
  getBlackjackNaturalPayout,
  getBlackjackWinPayoutMultiplier,
  getDiceCasinoGameLabel,
  getDiceCasinoMinBet,
  getDicePokerPayoutMultiplier,
  getExactRollDieSides,
  getExactRollFacePayout,
  getExactRollHighLowPayout,
  getExactRollHighMinFace,
  getExactRollLowMaxFace,
  getPushYourLuckCashoutPayout,
  getPushYourLuckCashoutStartUniqueFaces,
  getPushYourLuckPayoutTable,
} from "../../domain/game-rules";
import type { DiceCasinoAction, DiceCasinoActionRow, DiceCasinoGameViewContext } from "./types";
import type { DiceCasinoSession } from "../../domain/casino-session";
import { canStartCasinoRound, getExpectedRound } from "./helpers";
import { getDiceCasinoGameModule } from "./games";

type RenderedCasinoScreen = "lobby" | "setup" | "rules" | "active-round" | "result";

export const buildCasinoView = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction> => {
  const screen = resolveRenderedScreen(session);
  const lines = [
    buildHeaderLine(session, screen),
    `${formatPips(pips)} • **Bet ${session.bet}**`,
    ...buildCasinoContentLines(session, pips, screen),
  ];

  return {
    content: lines.join("\n"),
    components: buildCasinoComponents(session, pips, screen),
  };
};

const resolveRenderedScreen = (session: DiceCasinoSession): RenderedCasinoScreen => {
  if (session.state.currentScreen === "lobby") {
    return "lobby";
  }

  if (session.state.currentScreen === "rules") {
    return "rules";
  }

  if (session.state.activeRound) {
    return "active-round";
  }

  if (session.state.currentScreen === "result" && session.state.lastOutcome) {
    return "result";
  }

  return "setup";
};

const buildHeaderLine = (session: DiceCasinoSession, screen: RenderedCasinoScreen): string => {
  if (screen === "lobby") {
    return "**Dice Casino**";
  }

  return `**Dice Casino • ${getDiceCasinoGameLabel(session.state.selectedGame)}**`;
};

const buildCasinoContentLines = (
  session: DiceCasinoSession,
  pips: number,
  screen: RenderedCasinoScreen,
): string[] => {
  switch (screen) {
    case "lobby":
      return buildLobbyLines(session);
    case "rules":
      return buildRulesLines(session);
    case "active-round":
      return buildActiveRoundLines(session);
    case "result":
      return buildResultLines(session);
    case "setup":
      return buildSetupLines(session, pips);
  }
};

const buildLobbyLines = (session: DiceCasinoSession): string[] => {
  if (session.state.activeRound) {
    return [
      "Round in progress.",
      describeRoundInLobby(session),
      "Resume the round below. Game switching and bet changes stay locked until it ends.",
    ];
  }

  return [
    "Choose a game.",
    `Selected: ${getDiceCasinoGameLabel(session.state.selectedGame)}.`,
    "Use a game button below to open its setup screen.",
  ];
};

const describeRoundInLobby = (session: DiceCasinoSession): string => {
  const gameLabel = getDiceCasinoGameLabel(session.state.selectedGame);
  const round = session.state.activeRound;
  if (!round) {
    return `${gameLabel} • Bet ${session.bet}`;
  }

  if (round.type === "push-your-luck") {
    return `${gameLabel} • ${round.uniqueValues.length} unique faces • Bet ${round.bet}`;
  }

  if (round.type === "blackjack") {
    const total = getBlackjackHandTotals(round.playerHand).total;
    return `${gameLabel} • You ${total} • Bet ${round.bet}`;
  }

  const heldCount = round.heldIndices.length;
  return `${gameLabel} • ${heldCount} held${heldCount === 1 ? "" : "s"} • Bet ${round.bet}`;
};

const buildSetupLines = (session: DiceCasinoSession, pips: number): string[] => {
  switch (session.state.selectedGame) {
    case "exact-roll":
      return [
        `Mode: ${session.state.exactRollMode === "exact-face" ? "Exact Face" : "High / Low"} • Pick: ${getExactRollPickLabel(session)}`,
        `Exact Face pays ${formatPips(getExactRollFacePayout(session.bet))}.`,
        `High / Low pays ${formatPips(getExactRollHighLowPayout(session.bet))}.`,
        canStartCasinoRound(session.bet, pips)
          ? "Pick a face or High / Low button to place the bet."
          : `You need ${formatPips(session.bet)} to place this bet.`,
      ];
    case "push-your-luck":
      return [
        "Roll new faces to build value. Repeat a face and bust.",
        `Cash out from ${getPushYourLuckCashoutStartUniqueFaces()} uniques onward.`,
        ...getPushYourLuckPayoutTable().map(
          (entry) =>
            `${entry.uniqueFaces} uniques -> ${formatPips(
              getPushYourLuckCashoutPayout(session.bet, entry.uniqueFaces),
            )}.`,
        ),
      ];
    case "blackjack":
      return [
        "Beat the dealer without going over 21.",
        `Win pays ${formatPips(session.bet * getBlackjackWinPayoutMultiplier())}.`,
        `Push returns ${formatPips(session.bet)}.`,
        `Natural 21 pays ${formatPips(getBlackjackNaturalPayout(session.bet))}.`,
      ];
    case "dice-poker":
      return [
        `Roll ${dicePokerDiceCount}d${dicePokerDieSides}, hold any, then reroll the rest once.`,
        `Five of a Kind -> ${formatPips(
          session.bet * getDicePokerPayoutMultiplier("five-of-a-kind"),
        )}.`,
        `Four of a Kind -> ${formatPips(
          session.bet * getDicePokerPayoutMultiplier("four-of-a-kind"),
        )}.`,
        `Full House -> ${formatPips(session.bet * getDicePokerPayoutMultiplier("full-house"))}.`,
        `Straight -> ${formatPips(session.bet * getDicePokerPayoutMultiplier("straight"))}.`,
      ];
  }
};

const buildRulesLines = (session: DiceCasinoSession): string[] => {
  switch (session.state.selectedGame) {
    case "exact-roll":
      return [
        `Exact Face pays ${formatPips(getExactRollFacePayout(session.bet))}.`,
        `High / Low pays ${formatPips(getExactRollHighLowPayout(session.bet))}.`,
        `Low covers 1-${getExactRollLowMaxFace()}. High covers ${getExactRollHighMinFace()}-${getExactRollDieSides()}.`,
      ];
    case "push-your-luck":
      return [
        "Repeat a face and bust.",
        `Cash out starts at ${getPushYourLuckCashoutStartUniqueFaces()} uniques.`,
        ...getPushYourLuckPayoutTable().map(
          (entry) =>
            `${entry.uniqueFaces} uniques -> ${formatPips(
              getPushYourLuckCashoutPayout(session.bet, entry.uniqueFaces),
            )}.`,
        ),
      ];
    case "blackjack":
      return [
        "Beat the dealer without going over 21.",
        "A 1 counts as Ace for 1 or 11.",
        `Win pays ${formatPips(session.bet * getBlackjackWinPayoutMultiplier())}.`,
        `Natural 21 pays ${formatPips(getBlackjackNaturalPayout(session.bet))}.`,
      ];
    case "dice-poker":
      return [
        "Hold any dice, then reroll the rest once.",
        `Five of a Kind -> ${formatPips(
          session.bet * getDicePokerPayoutMultiplier("five-of-a-kind"),
        )}.`,
        `Four of a Kind -> ${formatPips(
          session.bet * getDicePokerPayoutMultiplier("four-of-a-kind"),
        )}.`,
        `Full House -> ${formatPips(session.bet * getDicePokerPayoutMultiplier("full-house"))}.`,
        `Straight -> ${formatPips(session.bet * getDicePokerPayoutMultiplier("straight"))}.`,
      ];
  }
};

const buildActiveRoundLines = (session: DiceCasinoSession): string[] => {
  switch (session.state.selectedGame) {
    case "exact-roll":
      return buildSetupLines(session, 0);
    case "push-your-luck": {
      const round = getExpectedRound(session.state.activeRound, "push-your-luck");
      if (!round) {
        return [];
      }

      const lines = [
        `Rolls: ${formatDice(round.rolls)}.`,
        `Unique faces: ${round.uniqueValues.length}.`,
        canPushYourLuckCashOut(round)
          ? `Cash out for ${formatPips(getPushYourLuckCashoutPayout(round.bet, round.uniqueValues.length))}.`
          : `Cash out unlocks at ${getPushYourLuckCashoutStartUniqueFaces()} uniques.`,
      ];
      const updateLine = getActiveUpdateLine(session.state.lastOutcome);
      if (updateLine) {
        lines.push(updateLine);
      }

      return lines;
    }
    case "blackjack": {
      const round = getExpectedRound(session.state.activeRound, "blackjack");
      if (!round) {
        return [];
      }

      const playerTotals = getBlackjackHandTotals(round.playerHand);
      const lines = [
        `Dealer: ${formatBlackjackDice(round.dealerHand, true)}.`,
        `You: ${formatDice(round.playerHand)} = ${playerTotals.total}${playerTotals.isSoft ? " (soft)" : ""}.`,
      ];
      const updateLine = getActiveUpdateLine(session.state.lastOutcome);
      if (updateLine) {
        lines.push(updateLine);
      }

      return lines;
    }
    case "dice-poker": {
      const round = getExpectedRound(session.state.activeRound, "dice-poker");
      if (!round) {
        return [];
      }

      const heldDice =
        round.heldIndices.length > 0
          ? round.heldIndices.map((index) => index + 1).join(", ")
          : "none";
      const lines = [
        `Roll: ${formatDice(round.initialRoll)}.`,
        `Held: ${heldDice}.`,
        "Choose holds, then reroll once.",
      ];
      const updateLine = getActiveUpdateLine(session.state.lastOutcome);
      if (updateLine) {
        lines.push(updateLine);
      }

      return lines;
    }
  }
};

const buildResultLines = (session: DiceCasinoSession): string[] => {
  return splitOutcomeLines(session.state.lastOutcome);
};

const getActiveUpdateLine = (lastOutcome: string | null): string | null => {
  if (!lastOutcome) {
    return null;
  }

  const [firstLine] = splitOutcomeLines(lastOutcome);
  if (!firstLine) {
    return null;
  }

  return `Update: ${firstLine}`;
};

const splitOutcomeLines = (lastOutcome: string | null): string[] => {
  if (!lastOutcome) {
    return ["No result yet."];
  }

  return lastOutcome
    .replace(/ Dealer: /g, "\nDealer: ")
    .replace(/ You: /g, "\nYou: ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const buildCasinoComponents = (
  session: DiceCasinoSession,
  pips: number,
  screen: RenderedCasinoScreen,
): ActionView<DiceCasinoAction>["components"] => {
  switch (screen) {
    case "lobby":
      return buildLobbyComponents(session, pips);
    case "rules":
      return buildRulesComponents(session, pips);
    case "active-round":
      return buildActiveRoundComponents(session, pips);
    case "result":
      return buildResultComponents(session, pips);
    case "setup":
      return buildSetupComponents(session, pips);
  }
};

const buildLobbyComponents = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction>["components"] => {
  const rows: ActionView<DiceCasinoAction>["components"] = [
    buildGameSelectionRow(session, Boolean(session.state.activeRound)),
    buildBetDecreaseRow(session, pips, Boolean(session.state.activeRound)),
    buildBetIncreaseRow(session, pips, Boolean(session.state.activeRound)),
  ];

  const utilityRow: DiceCasinoActionRow = session.state.activeRound
    ? [
        {
          action: buildActionTarget(session, "resume-round"),
          label: "Resume Round",
          style: "primary",
        },
      ]
    : [
        {
          action: buildActionTarget(session, "show-rules"),
          label: "Rules",
          style: "secondary",
        },
      ];
  rows.push(utilityRow);

  return rows;
};

const buildSetupComponents = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction>["components"] => {
  const rows: ActionView<DiceCasinoAction>["components"] = [
    [
      {
        action: buildActionTarget(session, "go-lobby"),
        label: "Back to Lobby",
        style: "secondary",
      },
      {
        action: buildActionTarget(session, "show-rules"),
        label: "Rules",
        style: "secondary",
      },
    ],
    buildBetDecreaseRow(session, pips, false),
    buildBetIncreaseRow(session, pips, false),
  ];

  if (session.state.selectedGame === "exact-roll") {
    return buildExactRollSetupComponents(session, pips);
  }

  rows.push([
    {
      action: buildActionTarget(session, "play"),
      label: "Play",
      style: "success",
      disabled: !canStartCasinoRound(session.bet, pips),
    },
  ]);

  return rows;
};

const buildExactRollSetupComponents = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction>["components"] => {
  const rows: ActionView<DiceCasinoAction>["components"] = [
    [
      {
        action: buildActionTarget(session, "go-lobby"),
        label: "Lobby",
        style: "secondary",
      },
      {
        action: buildActionTarget(session, "show-rules"),
        label: "Rules",
        style: "secondary",
      },
      {
        action: { ...buildActionTarget(session, "exact-mode"), mode: "exact-face" },
        label: "Exact Face",
        style: session.state.exactRollMode === "exact-face" ? "primary" : "secondary",
      },
      {
        action: { ...buildActionTarget(session, "exact-mode"), mode: "high-low" },
        label: "High / Low",
        style: session.state.exactRollMode === "high-low" ? "primary" : "secondary",
      },
    ],
    buildBetDecreaseRow(session, pips, false),
    buildBetIncreaseRow(session, pips, false),
  ];

  if (session.state.exactRollMode === "high-low") {
    rows.push([
      {
        action: { ...buildActionTarget(session, "exact-high-low"), choice: "low" },
        label: `Low (${getExactRollLowMaxFace()})`,
        style: session.state.exactRollHighLowChoice === "low" ? "primary" : "secondary",
        disabled: !canStartCasinoRound(session.bet, pips),
      },
      {
        action: { ...buildActionTarget(session, "exact-high-low"), choice: "high" },
        label: `High (${getExactRollHighMinFace()}+)`,
        style: session.state.exactRollHighLowChoice === "high" ? "primary" : "secondary",
        disabled: !canStartCasinoRound(session.bet, pips),
      },
    ]);
    return rows;
  }

  const faceButtons: ActionButtonSpec<DiceCasinoAction>[] = Array.from(
    { length: getExactRollDieSides() },
    (_, index) => index + 1,
  ).map((face) => ({
    action: { ...buildActionTarget(session, "exact-face"), face },
    label: `${face}`,
    style: session.state.exactRollFace === face ? "primary" : "secondary",
    disabled: !canStartCasinoRound(session.bet, pips),
  }));
  const buttonsPerRow = Math.ceil(faceButtons.length / 2);
  rows.push(...chunkActionButtons(faceButtons, buttonsPerRow));

  return rows;
};

const buildRulesComponents = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction>["components"] => {
  const rows: ActionView<DiceCasinoAction>["components"] = [
    [
      {
        action: buildActionTarget(session, "back"),
        label: "Back",
        style: "secondary",
      },
    ],
  ];

  if (session.state.selectedGame !== "exact-roll") {
    rows[0].push({
      action: buildActionTarget(session, "play"),
      label: "Play",
      style: "success",
      disabled: !canStartCasinoRound(session.bet, pips),
    });
  }

  return rows;
};

const buildActiveRoundComponents = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction>["components"] => {
  return [
    [
      {
        action: buildActionTarget(session, "go-lobby"),
        label: "Back to Lobby",
        style: "secondary",
      },
    ],
    ...getDiceCasinoGameModule(session.state.selectedGame).buildComponentRows(
      buildGameViewContext(session, pips),
    ),
  ];
};

const buildResultComponents = (
  session: DiceCasinoSession,
  pips: number,
): ActionView<DiceCasinoAction>["components"] => {
  return [
    [
      {
        action: buildActionTarget(session, "go-lobby"),
        label: "Back to Lobby",
        style: "secondary",
      },
      {
        action: buildActionTarget(session, "show-rules"),
        label: "Rules",
        style: "secondary",
      },
      {
        action: buildActionTarget(session, "play-again"),
        label: "Play Again",
        style: "success",
        disabled: !canStartCasinoRound(session.bet, pips),
      },
    ],
  ];
};

const buildGameSelectionRow = (
  session: DiceCasinoSession,
  disabled: boolean,
): DiceCasinoActionRow => {
  const row: DiceCasinoActionRow = [
    {
      action: { ...buildActionTarget(session, "select-game"), game: "exact-roll" },
      label: getDiceCasinoGameLabel("exact-roll"),
      style: session.state.selectedGame === "exact-roll" ? "primary" : "secondary",
      disabled,
    },
    {
      action: { ...buildActionTarget(session, "select-game"), game: "push-your-luck" },
      label: getDiceCasinoGameLabel("push-your-luck"),
      style: session.state.selectedGame === "push-your-luck" ? "primary" : "secondary",
      disabled,
    },
    {
      action: { ...buildActionTarget(session, "select-game"), game: "blackjack" },
      label: getDiceCasinoGameLabel("blackjack"),
      style: session.state.selectedGame === "blackjack" ? "primary" : "secondary",
      disabled,
    },
    {
      action: { ...buildActionTarget(session, "select-game"), game: "dice-poker" },
      label: getDiceCasinoGameLabel("dice-poker"),
      style: session.state.selectedGame === "dice-poker" ? "primary" : "secondary",
      disabled,
    },
    {
      action: buildActionTarget(session, "refresh"),
      label: "Refresh",
      style: "secondary",
    },
  ];

  return row;
};

const buildBetDecreaseRow = (
  session: DiceCasinoSession,
  pips: number,
  disabled: boolean,
): DiceCasinoActionRow => {
  const betLocked = disabled || pips < getDiceCasinoMinBet();
  return [
    {
      action: { ...buildActionTarget(session, "adjust-bet"), adjustment: "min" },
      label: "Min",
      style: "secondary",
      disabled: betLocked,
    },
    {
      action: { ...buildActionTarget(session, "adjust-bet"), adjustment: "-10" },
      label: "-10",
      style: "secondary",
      disabled: betLocked,
    },
    {
      action: { ...buildActionTarget(session, "adjust-bet"), adjustment: "-1" },
      label: "-1",
      style: "secondary",
      disabled: betLocked,
    },
  ];
};

const buildBetIncreaseRow = (
  session: DiceCasinoSession,
  pips: number,
  disabled: boolean,
): DiceCasinoActionRow => {
  const betLocked = disabled || pips < getDiceCasinoMinBet();
  return [
    {
      action: { ...buildActionTarget(session, "adjust-bet"), adjustment: "+1" },
      label: "+1",
      style: "secondary",
      disabled: betLocked,
    },
    {
      action: { ...buildActionTarget(session, "adjust-bet"), adjustment: "+10" },
      label: "+10",
      style: "secondary",
      disabled: betLocked,
    },
    {
      action: { ...buildActionTarget(session, "adjust-bet"), adjustment: "max" },
      label: "Max",
      style: "secondary",
      disabled: betLocked,
    },
  ];
};

const buildGameViewContext = (
  session: DiceCasinoSession,
  pips: number,
): DiceCasinoGameViewContext => {
  return {
    session,
    pips,
    hasAffordableBet: canStartCasinoRound(session.bet, pips),
    roundActive: Boolean(session.state.activeRound),
  };
};

const buildActionTarget = <TType extends DiceCasinoAction["type"]>(
  session: DiceCasinoSession,
  type: TType,
): Extract<DiceCasinoAction, { type: TType }> => {
  return {
    type,
    ownerId: session.userId,
    sessionToken: session.state.sessionToken,
  } as Extract<DiceCasinoAction, { type: TType }>;
};

const getExactRollPickLabel = (session: DiceCasinoSession): string => {
  if (session.state.exactRollMode === "exact-face") {
    return String(session.state.exactRollFace);
  }

  return session.state.exactRollHighLowChoice === "low" ? "Low" : "High";
};

const formatPips = (pips: number): string => {
  return `${pips} pip${pips === 1 ? "" : "s"}`;
};
