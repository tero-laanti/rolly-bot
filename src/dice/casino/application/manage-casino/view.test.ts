import assert from "node:assert/strict";
import test from "node:test";
import type { DiceCasinoSession, DicePokerRoundState } from "../../domain/casino-session";
import { createDefaultDiceCasinoSessionState } from "../../domain/casino-session";
import { buildCasinoView } from "./view";

const createSession = (
  stateOverrides: Partial<DiceCasinoSession["state"]> = {},
  overrides: Partial<DiceCasinoSession> = {},
): DiceCasinoSession => {
  return {
    userId: "user-1",
    bet: 10,
    state: {
      ...createDefaultDiceCasinoSessionState("session-1"),
      ...stateOverrides,
    },
    expiresAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
};

test("lobby omits selected text and renders all game buttons as direct actions", () => {
  const view = buildCasinoView(createSession(), 100);

  assert.doesNotMatch(view.content, /Selected:/);

  const gameButtons = view.components[0]?.slice(0, 4) ?? [];
  assert.equal(gameButtons.length, 4);
  assert.deepEqual(
    gameButtons.map((button) => button.style),
    ["success", "success", "success", "success"],
  );
});

test("exact roll setup omits pick text and keeps wager buttons green while mode stays highlighted", () => {
  const exactFaceView = buildCasinoView(
    createSession({
      currentScreen: "setup",
      selectedGame: "exact-roll",
      exactRollMode: "exact-face",
      exactRollFace: 4,
    }),
    100,
  );

  assert.doesNotMatch(exactFaceView.content, /Pick:/);
  assert.match(exactFaceView.content, /Mode: Exact Face\./);
  assert.equal(exactFaceView.components[0]?.[2]?.style, "primary");
  assert.equal(exactFaceView.components[0]?.[3]?.style, "secondary");

  const exactFaceButtons = exactFaceView.components.slice(3).flat();
  assert.ok(exactFaceButtons.length > 0);
  assert.ok(exactFaceButtons.every((button) => button.style === "success"));
  assert.equal(exactFaceButtons[0]?.emoji?.name, "d1");

  const highLowView = buildCasinoView(
    createSession({
      currentScreen: "setup",
      selectedGame: "exact-roll",
      exactRollMode: "high-low",
      exactRollHighLowChoice: "high",
    }),
    100,
  );

  assert.doesNotMatch(highLowView.content, /Pick:/);
  assert.equal(highLowView.components[0]?.[2]?.style, "secondary");
  assert.equal(highLowView.components[0]?.[3]?.style, "primary");
  assert.deepEqual(
    highLowView.components[3]?.map((button) => button.style),
    ["success", "success"],
  );
});

test("dice poker active round uses emoji dice and hold labels based on die values", () => {
  const round: DicePokerRoundState = {
    type: "dice-poker",
    bet: 10,
    initialRoll: [6, 5, 3, 5, 1],
    heldIndices: [1, 4],
    stage: "holding",
  };

  const view = buildCasinoView(
    createSession({
      currentScreen: "setup",
      selectedGame: "dice-poker",
      activeRound: round,
      lastOutcome: "Dice Poker hand started.",
    }),
    100,
  );

  assert.match(
    view.content,
    /Roll: <:d6:1486278558862147664> <:d5:1486276551896076319> <:d3:1486276367552348200> <:d5:1486276551896076319> <:d1:1486276117118845019>\./,
  );
  assert.match(view.content, /Held: <:d5:1486276551896076319>, <:d1:1486276117118845019>\./);

  const holdButtons = view.components[1] ?? [];
  assert.deepEqual(
    holdButtons.map((button) => button.label),
    ["Hold", "Held", "Hold", "Hold", "Held"],
  );
  assert.deepEqual(
    holdButtons.map((button) => button.emoji?.name),
    ["d6", "d5", "d3", "d5", "d1"],
  );
});
