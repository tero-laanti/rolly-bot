import assert from "node:assert/strict";
import test from "node:test";
import {
  getDiceContractsData,
  getDiceRaidsData,
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
      contracts.daily.contractsPerWindow === 3 &&
      contracts.weekly.contractsPerWindow === 5 &&
      contracts.daily.difficulties.simple.initialOffers.length > 0 &&
      contracts.weekly.difficulties.brutal.refillOffers.length > 0,
    `Expected contracts content from ${getRollyDataSourceDescription()}`,
  );
});

test("example rolly-data source loads authored raid tiers and bosses", () => {
  const raids = getDiceRaidsData();

  assert.ok(
    raids.tiers.length > 0 &&
      raids.bosses.length > 0 &&
      raids.tiers[0]?.bossIds.length > 0 &&
      raids.copy.panelTitle === "Rolly Raids",
    `Expected raids content from ${getRollyDataSourceDescription()}`,
  );
});
