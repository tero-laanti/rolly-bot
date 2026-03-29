import assert from "node:assert/strict";
import test from "node:test";
import { parseRaidButtonAction } from "./raid-buttons";

test("parseRaidButtonAction rejects trailing segments", () => {
  assert.equal(parseRaidButtonAction("raids:panel-open-boss-chooser:bronze:extra"), null);
  assert.equal(parseRaidButtonAction("raids:choose-boss:bronze:bone-dragon:extra"), null);
  assert.equal(parseRaidButtonAction("raids:join-run:raid-run-1:1:extra"), null);
});

test("parseRaidButtonAction accepts the supported action shapes", () => {
  assert.deepEqual(parseRaidButtonAction("raids:panel-open-boss-chooser:bronze"), {
    kind: "panel-open-boss-chooser",
    tierId: "bronze",
  });
  assert.deepEqual(parseRaidButtonAction("raids:choose-boss:bronze:bone-dragon"), {
    kind: "choose-boss",
    tierId: "bronze",
    bossId: "bone-dragon",
  });
  assert.deepEqual(parseRaidButtonAction("raids:start-run:raid-run-1:3"), {
    kind: "start-run",
    runId: "raid-run-1",
    version: 3,
  });
});
