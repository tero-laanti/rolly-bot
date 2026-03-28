import assert from "node:assert/strict";
import test from "node:test";
import {
  getDiceContractsData,
  getRandomEventContentPackV1,
  getRollyDataSourceDescription,
} from "./load";
import { getExampleRollyDataDir } from "./paths";

const originalRollyDataDir = process.env.ROLLY_DATA_DIR;

test.before(() => {
  process.env.ROLLY_DATA_DIR = getExampleRollyDataDir();
});

test.after(() => {
  if (originalRollyDataDir === undefined) {
    delete process.env.ROLLY_DATA_DIR;
    return;
  }

  process.env.ROLLY_DATA_DIR = originalRollyDataDir;
});

test("example rolly-data source loads a non-empty random-event pack", () => {
  const pack = getRandomEventContentPackV1();

  assert.ok(
    pack.length > 0,
    `Expected random-event content from ${getRollyDataSourceDescription()}`,
  );
});

test("example rolly-data source loads Contract Master cadence and difficulty data", () => {
  const contracts = getDiceContractsData();

  assert.ok(
    contracts.panel.title === "Contract Master" &&
      contracts.daily.difficulties.simple.initialOffers.length > 0 &&
      contracts.weekly.difficulties.brutal.refillOffers.length > 0,
    `Expected contracts content from ${getRollyDataSourceDescription()}`,
  );
});
