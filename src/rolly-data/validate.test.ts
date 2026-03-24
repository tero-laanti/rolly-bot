import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDiceAchievements,
  parseDiceBalance,
  parseDiceItems,
  parseDiceRaidsData,
  parseIntroPostsV1Data,
  parseRandomEventScenarios,
  validateRandomEventConsumableRewards,
} from "./validate";

type RandomEventScenarioInput = {
  id: string;
  rarity: string;
  title: string;
  prompt: string;
  claimLabel: string;
  claimPolicy: string;
  claimWindowSeconds: number;
  requiredReadyCount?: number;
  retryPolicy?: string;
  challengeOutcomeIds?: {
    success: string[];
    failure: string[];
  };
  outcomes: Array<{
    id: string;
    resolution: string;
    message: string;
    effects: unknown[];
  }>;
};

const createRandomEventScenarioInput = (): RandomEventScenarioInput => {
  return {
    id: "parse-time-scenario",
    rarity: "rare",
    title: "Parse Time Scenario",
    prompt: "A puzzle appears.",
    claimLabel: "Solve",
    claimPolicy: "multi-user",
    claimWindowSeconds: 60,
    outcomes: [
      {
        id: "success",
        resolution: "resolve-success",
        message: "The puzzle yields.",
        effects: [],
      },
    ],
  };
};

const createDiceBalanceInput = () => ({
  prestigeSides: [6, 8, 12, 20],
  lowerPrestigeBaseLevel: 5,
  banStep: 4,
  levelUpReward: 1,
  firstDailyRollPipReward: 5,
  maxRollPassCount: 500,
  charge: {
    startAfterMinutes: 10,
    maxMultiplier: 100,
  },
});

const createDiceItemInput = () => ({
  id: "padded-bracers",
  name: "Padded Bracers",
  description: "Reduce PvP loser lockout duration.",
  pricePips: 25,
  consumable: false,
  effect: {
    type: "passive-pvp-loser-lockout-reduction",
    reductionPercent: 0.25,
    minimumMinutes: 5,
  },
});

test("parseDiceBalance preserves firstDailyRollPipReward when provided", () => {
  const input = createDiceBalanceInput();
  const parsed = parseDiceBalance(input);

  assert.equal(parsed.firstDailyRollPipReward, 5);
});

test("parseDiceAchievements defaults hidden to false when omitted", () => {
  const parsed = parseDiceAchievements([
    {
      id: "example-achievement",
      name: "Example Achievement",
      description: "Example description.",
      category: "roll",
      rule: {
        type: "manual",
      },
    },
  ]);

  assert.equal(parsed[0]?.hidden, false);
});

test("parseRandomEventScenarios rejects invalid requiredReadyCount at load time", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.requiredReadyCount = 6;

  assert.throws(
    () => parseRandomEventScenarios([scenario]),
    /requiredReadyCount must be between 2 and 5/i,
  );
});

test("parseRandomEventScenarios rejects retryPolicy without keep-open failures at load time", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimPolicy = "first-click";
  scenario.retryPolicy = "allow-retry";

  assert.throws(
    () => parseRandomEventScenarios([scenario]),
    /retryPolicy is only valid for events with keep-open failures/i,
  );
});

test("parseRandomEventScenarios rejects stray challengeOutcomeIds without a roll challenge", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.challengeOutcomeIds = {
    success: ["success"],
    failure: ["success"],
  };

  assert.throws(
    () => parseRandomEventScenarios([scenario]),
    /challengeOutcomeIds require an explicit rollChallenge/i,
  );
});

test("parseDiceBalance defaults firstDailyRollPipReward to zero when omitted", () => {
  const parsed = parseDiceBalance({
    prestigeSides: [6, 8, 12, 20],
    lowerPrestigeBaseLevel: 5,
    banStep: 4,
    levelUpReward: 1,
    maxRollPassCount: 500,
    charge: {
      startAfterMinutes: 10,
      maxMultiplier: 100,
    },
  });

  assert.equal(parsed.firstDailyRollPipReward, 0);
});

test("parseDiceRaidsData keeps legacy pipsByBossLevel rewards readable", () => {
  const raids = parseDiceRaidsData({
    reward: {
      pipsByBossLevel: [
        { bossLevelAtLeast: 1, pips: 4 },
        { bossLevelAtLeast: 5, pips: 6 },
      ],
      rollPassBuff: {
        multiplierPerBossLevel: 1,
        minimumMultiplier: 2,
        maximumMultiplier: 10,
        rollsPerBossLevelDivisor: 5,
        minimumRolls: 1,
        maximumRolls: 3,
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

  assert.ok("pipsByBossLevel" in raids.reward);
  assert.deepEqual(raids.reward.pipsByBossLevel, [
    { bossLevelAtLeast: 1, pips: 4 },
    { bossLevelAtLeast: 5, pips: 6 },
  ]);
});

test("parseDiceItems rejects passive effects on consumable items", () => {
  const item = createDiceItemInput();
  item.consumable = true;

  assert.throws(
    () => parseDiceItems([item]),
    /Passive item padded-bracers must set consumable to false/i,
  );
});

test("validateRandomEventConsumableRewards rejects unknown item ids", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.outcomes = [
    {
      id: "success",
      resolution: "resolve-success",
      message: "You find something useful.",
      effects: [
        {
          type: "consumable-item",
          itemId: "missing-item",
          quantity: 1,
        },
      ],
    },
  ];

  const parsedScenarios = parseRandomEventScenarios([scenario]);
  const parsedItems = parseDiceItems([
    {
      id: "dice-revolver",
      name: "Dice Revolver",
      description: "Your next few /roll uses roll twice.",
      pricePips: 6,
      consumable: true,
      effect: {
        type: "double-roll-uses",
        uses: 6,
      },
    },
  ]);

  assert.throws(
    () => validateRandomEventConsumableRewards(parsedScenarios, parsedItems),
    /references unknown consumable item 'missing-item'/i,
  );
});

test("validateRandomEventConsumableRewards rejects passive item rewards", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.outcomes = [
    {
      id: "success",
      resolution: "resolve-success",
      message: "You find something useful.",
      effects: [
        {
          type: "consumable-item",
          itemId: "padded-bracers",
          quantity: 1,
        },
      ],
    },
  ];

  const parsedScenarios = parseRandomEventScenarios([scenario]);
  const parsedItems = parseDiceItems([createDiceItemInput()]);

  assert.throws(
    () => validateRandomEventConsumableRewards(parsedScenarios, parsedItems),
    /must reference a consumable item/i,
  );
});

test("parseIntroPostsV1Data accepts valid intro posts", () => {
  const parsed = parseIntroPostsV1Data({
    messages: [{ content: "# Welcome to Rolly" }, { content: "Use /roll to get started." }],
  });

  assert.deepEqual(parsed, {
    messages: [{ content: "# Welcome to Rolly" }, { content: "Use /roll to get started." }],
  });
});

test("parseIntroPostsV1Data accepts content at Discord's 2000-character limit", () => {
  const content = "a".repeat(2_000);

  const parsed = parseIntroPostsV1Data({
    messages: [{ content }],
  });

  assert.deepEqual(parsed, {
    messages: [{ content }],
  });
});

test("parseIntroPostsV1Data rejects missing messages", () => {
  assert.throws(() => parseIntroPostsV1Data({}), /introPostsV1\.messages must be an array/i);
});

test("parseIntroPostsV1Data rejects empty messages arrays", () => {
  assert.throws(
    () => parseIntroPostsV1Data({ messages: [] }),
    /introPostsV1\.messages must include at least one entry/i,
  );
});

test("parseIntroPostsV1Data rejects empty content", () => {
  assert.throws(
    () => parseIntroPostsV1Data({ messages: [{ content: "   " }] }),
    /introPostsV1\.messages\[0\]\.content must not be empty/i,
  );
});

test("parseIntroPostsV1Data rejects content above Discord's 2000-character limit", () => {
  assert.throws(
    () => parseIntroPostsV1Data({ messages: [{ content: "a".repeat(2_001) }] }),
    /introPostsV1\.messages\[0\]\.content must be <= 2000 characters/i,
  );
});
