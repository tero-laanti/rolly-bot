import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getDiceAchievement,
  getDiceAchievementPipReward,
  getPrestigeAchievementId,
} from "./achievements";

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

test("example data keeps a single prestige achievement mapping", () => {
  assert.equal(getPrestigeAchievementId(1), "prestige-1");
  assert.equal(getDiceAchievementPipReward("prestige-1"), 20);
  assert.equal(getPrestigeAchievementId(2), undefined);
});

test("prestige achievement lookup scales to a live-data style 15-tier pack", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prestige-achievements-"));
  fs.cpSync(exampleRollyDataDir, tempRoot, { recursive: true });

  const achievementsPath = path.join(tempRoot, "achievements.json");
  const achievements = JSON.parse(fs.readFileSync(achievementsPath, "utf8"));
  const filtered = achievements.filter((achievement: { id: string }) => achievement.id !== "prestige-1");
  for (let prestige = 1; prestige <= 15; prestige += 1) {
    filtered.push({
      id: `prestige-${prestige}`,
      name: prestige === 15 ? "Max Prestige" : `Prestige ${prestige}`,
      description: `Reach Prestige ${prestige}.`,
      category: "progression",
      pipReward: prestige * 20,
      rule: { type: "manual" },
      manualAward: { type: "prestige", prestige },
      unlockReasonText: `reached Prestige ${prestige}`,
    });
  }
  fs.writeFileSync(achievementsPath, `${JSON.stringify(filtered, null, 2)}\n`);

  withEnv({ ROLLY_DATA_DIR: tempRoot }, () => {
    clearModules(["../../../rolly-data/load", "./achievements"]);

    try {
      const reloadedAchievements = moduleRequire("./achievements") as typeof import("./achievements");
      for (let prestige = 1; prestige <= 15; prestige += 1) {
        assert.equal(reloadedAchievements.getPrestigeAchievementId(prestige), `prestige-${prestige}`);
        assert.equal(reloadedAchievements.getDiceAchievementPipReward(`prestige-${prestige}`), prestige * 20);
      }
      assert.equal(reloadedAchievements.getPrestigeAchievementId(16), undefined);
      assert.equal(reloadedAchievements.getDiceAchievement("prestige-15")?.name, "Max Prestige");
    } finally {
      clearModules(["../../../rolly-data/load", "./achievements"]);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
