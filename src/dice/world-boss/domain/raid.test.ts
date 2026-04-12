import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  calculateWorldBossMaxHp,
  calculateWorldBossMaxHpForStrength,
  calculateWorldBossParticipantStrength,
  createWorldBoss,
  describeAppliedWorldBossReward,
  getDefaultWorldBossReward,
} from "./raid";

const moduleRequire = createRequire(__filename);
const exampleRollyDataDir = path.resolve(__dirname, "../../../../example-data/rolly-data");

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

const withEnv = (overrides: Record<string, string | undefined>, run: () => void): void => {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    process.env = previous;
  }
};
test("world boss pip reward formula stays flat through level 5 and scales from level 6", () => {
  assert.equal(getDefaultWorldBossReward(1).pips, 5);
  assert.equal(getDefaultWorldBossReward(5).pips, 5);
  assert.equal(getDefaultWorldBossReward(6).pips, 6);
  assert.equal(getDefaultWorldBossReward(35).pips, 35);
});

test("world boss reward tables support tiered roll-pass lengths", () => {
  const modulePaths = ["../../../rolly-data/load", "./raid"] as const;
  clearModules(modulePaths);

  const load = moduleRequire(
    "../../../rolly-data/load",
  ) as typeof import("../../../rolly-data/load");
  const originalGetWorldBossData = load.getWorldBossData;

  try {
    (load as { getWorldBossData: typeof load.getWorldBossData }).getWorldBossData = () => ({
      reward: {
        pipsByBossLevel: [
          { bossLevelAtLeast: 1, pips: 15 },
          { bossLevelAtLeast: 6, pips: 25 },
          { bossLevelAtLeast: 11, pips: 40 },
        ],
        rollPassBuff: {
          multiplierPerBossLevel: 2,
          minimumMultiplier: 4,
          maximumMultiplier: 100,
          rollsByBossLevel: [
            { bossLevelAtLeast: 1, rolls: 2 },
            { bossLevelAtLeast: 11, rolls: 4 },
            { bossLevelAtLeast: 21, rolls: 6 },
          ],
        },
      },
      bossNames: {
        prefixes: ["Example"],
        suffixes: ["Boss"],
      },
      bossBalance: {
        baseHp: 120,
        hpIncreasePerBossLevelPercent: 3,
        levelHalfLifeLevels: 10,
        maxBossLevel: 50,
      },
    });

    const raid = moduleRequire("./raid") as typeof import("./raid");

    assert.deepEqual(raid.getDefaultWorldBossReward(1), {
      pips: 15,
      rollPassMultiplier: 4,
      rollPassRolls: 2,
    });
    assert.deepEqual(raid.getDefaultWorldBossReward(12), {
      pips: 40,
      rollPassMultiplier: 24,
      rollPassRolls: 4,
    });
    assert.deepEqual(raid.getDefaultWorldBossReward(35), {
      pips: 40,
      rollPassMultiplier: 70,
      rollPassRolls: 6,
    });
  } finally {
    (load as { getWorldBossData: typeof load.getWorldBossData }).getWorldBossData =
      originalGetWorldBossData;
    clearModules(modulePaths);
  }
});

test("world boss hp scales by 3 percent per boss level", () => {
  assert.equal(calculateWorldBossMaxHp(1), 120);
  assert.equal(calculateWorldBossMaxHp(30), 283);
  assert.equal(calculateWorldBossMaxHp(50), 511);
});

test("world boss participant strength follows average five-die output", () => {
  assert.equal(calculateWorldBossParticipantStrength(0), 1);
  assert.equal(calculateWorldBossParticipantStrength(1), 9 / 7);
  assert.equal(calculateWorldBossParticipantStrength(2), 11 / 7);
  assert.equal(calculateWorldBossParticipantStrength(3), 13 / 7);
  assert.equal(calculateWorldBossParticipantStrength(4), 15 / 7);
  assert.equal(calculateWorldBossParticipantStrength(5), 17 / 7);
  assert.equal(calculateWorldBossParticipantStrength(8), 23 / 7);
});

test("world boss participant strength normalizes against the configured base die", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "world-boss-base-die-"));
  fs.cpSync(exampleRollyDataDir, tempRoot, { recursive: true });

  const diceBalancePath = path.join(tempRoot, "dice-balance.json");
  const diceBalance = JSON.parse(fs.readFileSync(diceBalancePath, "utf8")) as {
    prestigeSides: number[];
  };
  diceBalance.prestigeSides = [8, 10, 12, 14];
  fs.writeFileSync(diceBalancePath, `${JSON.stringify(diceBalance, null, 2)}\n`);

  withEnv({ ROLLY_DATA_DIR: tempRoot }, () => {
    clearModules([
      "../../../rolly-data/load",
      "../../../rolly-data/paths",
      "../../progression/domain/game-rules",
      "./raid",
    ]);

    try {
      const reloadedRaid = moduleRequire("./raid") as typeof import("./raid");
      assert.equal(reloadedRaid.calculateWorldBossParticipantStrength(0), 1);
      assert.equal(reloadedRaid.calculateWorldBossParticipantStrength(1), 11 / 9);
    } finally {
      clearModules([
        "../../../rolly-data/load",
        "../../../rolly-data/paths",
        "../../progression/domain/game-rules",
        "./raid",
      ]);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

test("world boss hp scales by summed player strength without a cap", () => {
  assert.equal(calculateWorldBossMaxHpForStrength(6, 1), 139);
  assert.equal(calculateWorldBossMaxHpForStrength(6, 2), 278);
  assert.equal(calculateWorldBossMaxHpForStrength(1, 17 / 7), 291);
  assert.equal(
    calculateWorldBossMaxHpForStrength(
      1,
      calculateWorldBossParticipantStrength(0) + calculateWorldBossParticipantStrength(1),
    ),
    274,
  );
});

test("world boss level roll is low-heavy and capped at level 50", () => {
  const levelOneBoss = createWorldBoss({
    random: () => 0,
  });
  const levelFiftyBoss = createWorldBoss({
    random: () => 0.999999,
  });
  const scaledBoss = createWorldBoss({
    random: () => 0,
    raiderStrength:
      calculateWorldBossParticipantStrength(0) +
      calculateWorldBossParticipantStrength(1) +
      calculateWorldBossParticipantStrength(2),
  });

  assert.equal(levelOneBoss.level, 1);
  assert.equal(levelOneBoss.maxHp, 120);
  assert.equal(levelFiftyBoss.level, 50);
  assert.equal(levelFiftyBoss.maxHp, 511);
  assert.equal(scaledBoss.maxHp, 463);
});

test("applied world boss reward summaries reflect permanent pip bonus outcomes", () => {
  const reward = getDefaultWorldBossReward(12);

  assert.equal(
    describeAppliedWorldBossReward(reward, [12, 12]),
    "12 pips and x12 roll buff for the next 2 /rolls per eligible player",
  );
  assert.equal(
    describeAppliedWorldBossReward(reward, [12, 14]),
    "12-14 pips, based on permanent bonuses and x12 roll buff for the next 2 /rolls per eligible player",
  );
});
