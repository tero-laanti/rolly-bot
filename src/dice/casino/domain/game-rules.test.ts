import assert from "node:assert/strict";
import test from "node:test";
import { formatBlackjackDice, formatDice, formatDieFace } from "./game-rules";

test("formatDieFace renders emoji for supported die faces and falls back for others", () => {
  assert.equal(formatDieFace(1), "<:d1:1486276117118845019>");
  assert.equal(formatDieFace(6), "<:d6:1486278558862147664>");
  assert.equal(formatDieFace(8), "<:d8:1486276768921944146>");
  assert.equal(formatDieFace(13), "[13]");
});

test("formatDice renders emoji dice sequences", () => {
  assert.equal(
    formatDice([6, 5, 3, 5, 1]),
    "<:d6:1486278558862147664> <:d5:1486276551896076319> <:d3:1486276367552348200> <:d5:1486276551896076319> <:d1:1486276117118845019>",
  );
});

test("formatBlackjackDice renders ace values and hidden hole cards", () => {
  assert.equal(
    formatBlackjackDice([1, 9, 1], false),
    "[11] <:d9:1486276864791285850> <:d1:1486276117118845019>",
  );
  assert.equal(formatBlackjackDice([1, 6], true), "[11] [?]");
  assert.equal(
    formatBlackjackDice([1, 10, 10], false),
    "<:d1:1486276117118845019> <:d10:1486276997129965629> <:d10:1486276997129965629>",
  );
});
