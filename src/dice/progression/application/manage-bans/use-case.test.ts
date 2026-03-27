import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const moduleRequire = createRequire(__filename);

const withCustomRollyData = <T>(run: (dataDir: string) => T): T => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rolly-bans-data-"));
  fs.cpSync(path.join(process.cwd(), "example-data/rolly-data"), tempDir, { recursive: true });
  const achievementsPath = path.join(tempDir, "achievements.json");
  const achievements = JSON.parse(fs.readFileSync(achievementsPath, "utf8")) as Array<
    Record<string, unknown>
  >;
  achievements.push({
    id: "first-ban",
    name: "House Rules",
    description: "Apply your first die ban.",
    category: "progression",
    rule: { type: "manual" },
    unlockReasonText: "first die ban applied",
    pipReward: 3,
  });
  fs.writeFileSync(achievementsPath, JSON.stringify(achievements, null, 2));

  try {
    return run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

const loadUseCase = (dataDir: string) => {
  const previous = process.env.ROLLY_DATA_DIR;
  process.env.ROLLY_DATA_DIR = dataDir;

  const loadModule = (modulePath: string) => {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
    return moduleRequire(modulePath);
  };

  try {
    loadModule("../../../../rolly-data/load");
    loadModule("../../domain/achievements");
    return loadModule("./use-case") as typeof import("./use-case");
  } finally {
    if (previous === undefined) {
      delete process.env.ROLLY_DATA_DIR;
    } else {
      process.env.ROLLY_DATA_DIR = previous;
    }
  }
};

const zeroPermanentBonuses = {
  getPermanentBonuses: () => ({
    extraBanSlots: 0,
    pipRewardBonusPercent: 0,
    personalCharge: {
      unlocked: false,
      minutesPerMultiplier: 0,
      speedMultiplier: 1,
      maxMultiplier: 1,
    },
  }),
};

test("first ban returns announcement metadata without inline achievement text", () => {
  withCustomRollyData((dataDir) => {
    const { createDiceBansUseCase } = loadUseCase(dataDir);
    const bans = new Map<number, Set<number>>();
    const useCase = createDiceBansUseCase({
      economy: {
        getFame: () => 100,
      },
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        clearDiceBan: () => undefined,
        clearSingleDiceBan: () => undefined,
        markFirstDiceBan: () => true,
        awardAchievements: (_userId, achievementIds) => achievementIds,
        getDiceBans: () => bans,
        getDiceCount: () => 1,
        getDiceSides: () => 6,
        setDiceBan: ({ dieIndex, bannedValue }) => {
          const values = bans.get(dieIndex) ?? new Set<number>();
          values.add(bannedValue);
          bans.set(dieIndex, values);
        },
      },
    });

    const result = useCase.handleDiceBansAction("user-1", {
      type: "ban",
      ownerId: "user-1",
      dieIndex: 1,
      value: 4,
      page: 0,
    });

    assert.deepEqual(result.achievementAnnouncements, [
      {
        userId: "user-1",
        achievementIds: ["first-ban"],
      },
    ]);
    assert.equal(result.payload.type, "view");
    if (result.payload.type !== "view") {
      return;
    }

    assert.match(result.payload.view.content, /Ban applied: 4 on die 1\./);
    assert.doesNotMatch(result.payload.view.content, /Achievement unlocked/i);
  });
});

test("clear bans requires an explicit confirmation step", () => {
  withCustomRollyData((dataDir) => {
    const { createDiceBansUseCase } = loadUseCase(dataDir);
    const bans = new Map<number, Set<number>>([[1, new Set([2, 4])]]);
    const useCase = createDiceBansUseCase({
      economy: {
        getFame: () => 100,
      },
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        clearDiceBan: () => undefined,
        clearSingleDiceBan: () => undefined,
        markFirstDiceBan: () => false,
        awardAchievements: () => [],
        getDiceBans: () => bans,
        getDiceCount: () => 1,
        getDiceSides: () => 6,
        setDiceBan: () => undefined,
      },
    });

    const result = useCase.handleDiceBansAction("user-1", {
      type: "request-clear-bans",
      ownerId: "user-1",
    });

    assert.equal(result.kind, "update");
    assert.equal(result.payload.type, "view");
    if (result.payload.type !== "view") {
      return;
    }

    assert.match(result.payload.view.content, /Clear all bans\?/);
    assert.deepEqual(
      result.payload.view.components[0]?.map((button) => button.label),
      ["Yes, clear all", "No"],
    );
    assert.deepEqual(Array.from(bans.get(1) ?? []), [2, 4]);
  });
});

test("confirmed clear bans removes all bans and returns to the die selection view", () => {
  withCustomRollyData((dataDir) => {
    const { createDiceBansUseCase } = loadUseCase(dataDir);
    const bans = new Map<number, Set<number>>([
      [1, new Set([2, 4])],
      [2, new Set([1])],
    ]);
    const useCase = createDiceBansUseCase({
      economy: {
        getFame: () => 100,
      },
      permanentBonuses: zeroPermanentBonuses,
      progression: {
        clearDiceBan: (userId, dieIndex) => {
          if (userId === "user-1") {
            bans.delete(dieIndex);
          }
        },
        clearSingleDiceBan: () => undefined,
        markFirstDiceBan: () => false,
        awardAchievements: () => [],
        getDiceBans: () => bans,
        getDiceCount: () => 2,
        getDiceSides: () => 6,
        setDiceBan: () => undefined,
      },
    });

    const result = useCase.handleDiceBansAction("user-1", {
      type: "clear-bans",
      ownerId: "user-1",
    });

    assert.equal(result.kind, "update");
    assert.equal(result.payload.type, "view");
    if (result.payload.type !== "view") {
      return;
    }

    assert.equal(bans.size, 0);
    assert.match(result.payload.view.content, /All bans cleared\./);
    assert.deepEqual(
      result.payload.view.components.at(-1)?.map((button) => button.label),
      ["Close", "Clear bans"],
    );
  });
});
