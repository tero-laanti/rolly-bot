import assert from "node:assert/strict";
import test from "node:test";
import { getRandomEventContentPackV1, getRollyDataSourceDescription } from "./load";

test("current rolly-data source loads a non-empty random-event pack", () => {
  const pack = getRandomEventContentPackV1();

  assert.ok(
    pack.length > 0,
    `Expected random-event content from ${getRollyDataSourceDescription()}`,
  );
});
