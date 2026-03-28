import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDiceAchievements,
  parseDiceBalance,
  parseDiceContractsData,
  parseDiceItems,
  parseWorldBossData,
  parseIntroPostsV1Data,
  parseRandomEventBalance,
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
  textVariables?: Record<string, string[]>;
  requiredReadyCount?: number;
  retryPolicy?: string;
  flow?: unknown;
  rollChallenge?: unknown;
  challengeOutcomeIds?: {
    success: string[];
    failure: string[];
  };
  outcomes: Array<{
    id: string;
    resolution: string;
    message: string;
    effects: unknown[];
    textVariables?: Record<string, string[]>;
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
  lowerPrestigeBaseDiceCount: 5,
  banStep: 4,
  diceCountIncreaseReward: 1,
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

type ContractsInput = {
  panel: {
    title: string;
    npcName: string;
    imageUrl: string;
    description: string;
    helperText: string;
    dailyButtonLabel: string;
    weeklyButtonLabel: string;
    askForContractButtonLabel: string;
  };
  daily: ContractsCadenceInput;
  weekly: ContractsCadenceInput;
};

type ContractOfferInput = {
  id: string;
  title: string;
  description: string;
  objective: {
    type: string;
    requiredCount: number;
  };
};

type ContractsDifficultyInput = {
  label: string;
  rewardPips: number;
  initialOffers: ContractOfferInput[];
  refillOffers: ContractOfferInput[];
};

type ContractsCadenceInput = {
  label: string;
  chooserTitle: string;
  chooserDescription: string;
  difficulties: Record<"simple" | "serious" | "brutal", ContractsDifficultyInput>;
};

const createContractOfferInput = (
  id: string,
  title: string,
  description: string,
  type: string,
  requiredCount: number,
): ContractOfferInput => ({
  id,
  title,
  description,
  objective: {
    type,
    requiredCount,
  },
});

const createCadenceInput = (
  label: string,
  simpleRewardPips: number,
  seriousRewardPips: number,
  brutalRewardPips: number,
): ContractsCadenceInput => ({
  label,
  chooserTitle: `${label} Contracts`,
  chooserDescription: `Choose a ${label.toLowerCase()} contract from one of three difficulties.`,
  difficulties: {
    simple: {
      label: "Simple",
      rewardPips: simpleRewardPips,
      initialOffers: [
        createContractOfferInput(
          `${label.toLowerCase()}-simple-roll`,
          `${label} Roll Routine`,
          `Use /roll ${label === "Daily" ? 12 : 80} times.`,
          "roll_count",
          label === "Daily" ? 12 : 80,
        ),
      ],
      refillOffers: [
        createContractOfferInput(
          `${label.toLowerCase()}-simple-casino`,
          `${label} Casino Warmup`,
          `Finish ${label === "Daily" ? 2 : 10} casino games.`,
          "casino_game_count",
          label === "Daily" ? 2 : 10,
        ),
      ],
    },
    serious: {
      label: "Serious",
      rewardPips: seriousRewardPips,
      initialOffers: [
        createContractOfferInput(
          `${label.toLowerCase()}-serious-pvp`,
          `${label} Duel Duty`,
          `Win ${label === "Daily" ? 1 : 4} PvP challenge${label === "Daily" ? "" : "s"}.`,
          "pvp_win_count",
          label === "Daily" ? 1 : 4,
        ),
      ],
      refillOffers: [
        createContractOfferInput(
          `${label.toLowerCase()}-serious-world-boss`,
          `${label} World Boss Detail`,
          `Join ${label === "Daily" ? 1 : 2} World Boss encounter${label === "Daily" ? "" : "s"}.`,
          "world_boss_join_count",
          label === "Daily" ? 1 : 2,
        ),
      ],
    },
    brutal: {
      label: "Brutal",
      rewardPips: brutalRewardPips,
      initialOffers: [
        createContractOfferInput(
          `${label.toLowerCase()}-brutal-roll`,
          `${label} Marathon`,
          `Use /roll ${label === "Daily" ? 30 : 180} times.`,
          "roll_count",
          label === "Daily" ? 30 : 180,
        ),
      ],
      refillOffers: [
        createContractOfferInput(
          `${label.toLowerCase()}-brutal-casino`,
          `${label} High Stakes`,
          `Finish ${label === "Daily" ? 8 : 30} casino games.`,
          "casino_game_count",
          label === "Daily" ? 8 : 30,
        ),
      ],
    },
  },
});

const createContractsInput = (): ContractsInput => ({
  panel: {
    title: "Contract Master",
    npcName: "Contract Master",
    imageUrl: "https://example.com/rolly/contract-master.png",
    description: "Take on Daily or Weekly contracts. Each difficulty offers a stronger pip payout.",
    helperText:
      "Finish your first contract in a cadence to unlock one more offer from the same difficulty.",
    dailyButtonLabel: "Daily Contracts",
    weeklyButtonLabel: "Weekly Contracts",
    askForContractButtonLabel: "Ask for a new contract",
  },
  daily: createCadenceInput("Daily", 12, 20, 32),
  weekly: createCadenceInput("Weekly", 30, 45, 70),
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

test("parseRandomEventBalance rejects non-positive claim window multipliers", () => {
  assert.throws(
    () =>
      parseRandomEventBalance({
        claimWindowDurationMultiplier: 0,
        variety: {
          antiRepeatCooldownTriggers: 0,
          rarityChances: {
            common: 1,
            uncommon: 0,
            rare: 0,
            epic: 0,
            legendary: 0,
          },
          pity: {
            enabled: false,
            startAfterNonRareTriggers: 0,
            rareWeightStep: 0,
            epicWeightStep: 0,
            legendaryWeightStep: 0,
            maxBonusMultiplier: 1,
          },
        },
      }),
    /claimWindowDurationMultiplier must be > 0/i,
  );
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

test("parseRandomEventScenarios accepts solo-ladder staged flows", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimPolicy = "first-click";
  scenario.outcomes = [];
  scenario.flow = {
    type: "solo-ladder",
    stages: [
      {
        id: "stage-one",
        label: "Swing",
        prompt: "Take a swing.",
        actionLabel: "Swing",
        rollChallenge: {
          id: "pinata-swing",
          mode: "single-step",
          steps: [
            {
              id: "pinata-hit",
              label: "Roll 4+",
              source: { type: "static-die", sides: 10 },
              target: 4,
              comparator: "gte",
            },
          ],
        },
        successMessage: "Candy spills out.",
        successEffects: [{ type: "currency", minAmount: 1, maxAmount: 1 }],
        failureMessage: "You whiff.",
        failureEffects: [
          { type: "temporary-roll-penalty", divisor: 2, rolls: 3, stackMode: "refresh" },
        ],
      },
    ],
  };

  const parsed = parseRandomEventScenarios([scenario]);
  assert.equal(parsed[0]?.flow?.type, "solo-ladder");
});

test("parseRandomEventScenarios rejects staged flows with top-level outcomes", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimPolicy = "first-click";
  scenario.flow = {
    type: "solo-ladder",
    stages: [
      {
        id: "stage-one",
        label: "Swing",
        prompt: "Take a swing.",
        actionLabel: "Swing",
        rollChallenge: {
          id: "pinata-swing",
          mode: "single-step",
          steps: [
            {
              id: "pinata-hit",
              label: "Roll 4+",
              source: { type: "static-die", sides: 10 },
              target: 4,
              comparator: "gte",
            },
          ],
        },
        successMessage: "Candy spills out.",
        successEffects: [{ type: "currency", minAmount: 1, maxAmount: 1 }],
        failureMessage: "You whiff.",
        failureEffects: [
          { type: "temporary-roll-penalty", divisor: 2, rolls: 3, stackMode: "refresh" },
        ],
      },
    ],
  };

  assert.throws(
    () => parseRandomEventScenarios([scenario]),
    /staged flows must define stage rewards instead of top-level outcomes/i,
  );
});

test("parseRandomEventScenarios rejects group-meter stages without requiredSuccesses", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimPolicy = "multi-user";
  scenario.outcomes = [];
  scenario.flow = {
    type: "group-meter",
    participantRewardPolicy: "finisher-bonus",
    stages: [
      {
        id: "meter-one",
        label: "Warm-up",
        prompt: "Sing together.",
        actionLabel: "Sing",
        successMessage: "The chorus catches.",
        successEffects: [{ type: "currency", minAmount: 4, maxAmount: 4 }],
      },
    ],
  };

  assert.throws(() => parseRandomEventScenarios([scenario]), /requiredSuccesses >= 2/i);
});

test("parseRandomEventScenarios accepts stake-offer flows", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimPolicy = "first-click";
  scenario.flow = {
    type: "stake-offer",
    stakePips: 4,
    acceptLabel: "Take bet",
    declineLabel: "Walk away",
    declineMessage: "The bookmaker shrugs and turns to the next mark.",
  };
  scenario.outcomes = [
    {
      id: "bookmaker-win",
      resolution: "resolve-success",
      message: "Your side wins the imaginary bout.",
      effects: [{ type: "currency", minAmount: 6, maxAmount: 7 }],
    },
    {
      id: "bookmaker-loss",
      resolution: "resolve-failure",
      message: "The imaginary underdog gets flattened instantly.",
      effects: [],
    },
  ];

  const parsed = parseRandomEventScenarios([scenario]);
  assert.equal(parsed[0]?.flow?.type, "stake-offer");
});

test("parseRandomEventScenarios rejects stake-offer flows with unsupported challenge state", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimPolicy = "first-click";
  scenario.retryPolicy = "once-per-user";
  scenario.rollChallenge = {
    id: "stake-offer-roll",
    mode: "single-step",
    steps: [
      {
        id: "stake-offer-step",
        label: "Roll 4+ on d6",
        source: { type: "static-die", sides: 6 },
        target: 4,
        comparator: "gte",
      },
    ],
  };
  scenario.flow = {
    type: "stake-offer",
    stakePips: 4,
    acceptLabel: "Take bet",
    declineLabel: "Walk away",
    declineMessage: "The bookmaker shrugs and turns to the next mark.",
  };
  scenario.challengeOutcomeIds = {
    success: ["bookmaker-win"],
    failure: ["bookmaker-loss"],
  };
  scenario.outcomes = [
    {
      id: "bookmaker-win",
      resolution: "resolve-success",
      message: "Your side wins the imaginary bout.",
      effects: [{ type: "currency", minAmount: 6, maxAmount: 7 }],
    },
    {
      id: "bookmaker-loss",
      resolution: "keep-open-failure",
      message: "The imaginary underdog gets flattened instantly.",
      effects: [{ type: "temporary-roll-penalty", divisor: 2, rolls: 3, stackMode: "refresh" }],
    },
  ];

  assert.throws(
    () => parseRandomEventScenarios([scenario]),
    /stake-offer flows cannot use top-level rollChallenge, challengeOutcomeIds, or retryPolicy|stake-offer flows cannot define keep-open-failure outcomes/i,
  );
});

test("parseRandomEventScenarios rejects rendered claim labels that exceed Discord button limits", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimLabel = "${action}";
  scenario.textVariables = {
    action: ["A".repeat(81)],
  };

  assert.throws(
    () => parseRandomEventScenarios([scenario]),
    /claimLabel as rendered in Discord must be <= 80 characters/i,
  );
});

test("parseRandomEventScenarios rejects rendered outcome messages that exceed Discord embed limits", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.outcomes = [
    {
      id: "success",
      resolution: "resolve-success",
      message: "${reward}",
      effects: [],
      textVariables: {
        reward: ["R".repeat(4_097)],
      },
    },
  ];

  assert.throws(
    () => parseRandomEventScenarios([scenario]),
    /outcomes\[0\]\.message as rendered in Discord must be <= 4096 characters/i,
  );
});

test("parseDiceBalance defaults firstDailyRollPipReward to zero when omitted", () => {
  const parsed = parseDiceBalance({
    prestigeSides: [6, 8, 12, 20],
    lowerPrestigeBaseDiceCount: 5,
    banStep: 4,
    diceCountIncreaseReward: 1,
    maxRollPassCount: 500,
    charge: {
      startAfterMinutes: 10,
      maxMultiplier: 100,
    },
  });

  assert.equal(parsed.firstDailyRollPipReward, 0);
});

test("parseWorldBossData keeps legacy pipsByBossLevel rewards readable", () => {
  const worldBoss = parseWorldBossData({
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
    participantStrength: {
      prestigeMultiplier: 1.5,
    },
  });

  assert.ok("pipsByBossLevel" in worldBoss.reward);
  assert.deepEqual(worldBoss.reward.pipsByBossLevel, [
    { bossLevelAtLeast: 1, pips: 4 },
    { bossLevelAtLeast: 5, pips: 6 },
  ]);
  assert.equal(worldBoss.participantStrength.prestigeMultiplier, 1.5);
});

test("parseWorldBossData rejects boss names that overflow World Boss titles", () => {
  assert.throws(
    () =>
      parseWorldBossData({
        reward: {
          pipsFormula: {
            flatPips: 5,
            flatPipsThroughBossLevel: 5,
          },
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
          prefixes: ["X".repeat(180)],
          suffixes: ["Y".repeat(120)],
        },
        bossBalance: {
          baseHp: 120,
          hpIncreasePerBossLevelPercent: 3,
          levelHalfLifeLevels: 10,
          maxBossLevel: 50,
        },
        participantStrength: {
          prestigeMultiplier: 1.5,
        },
      }),
    /active World Boss title must be <= 256 characters/i,
  );
});

test("parseDiceContractsData accepts Contract Master panel metadata and difficulty pools", () => {
  const parsed = parseDiceContractsData(createContractsInput());

  assert.equal(parsed.panel.title, "Contract Master");
  assert.equal(parsed.daily.label, "Daily");
  assert.equal(parsed.daily.difficulties.simple.rewardPips, 12);
  assert.equal(parsed.daily.difficulties.brutal.initialOffers[0]?.reward.pips, 32);
  assert.equal(
    parsed.weekly.difficulties.serious.refillOffers[0]?.objective.type,
    "world_boss_join_count",
  );
});

test("parseDiceContractsData rejects unsupported objective types", () => {
  const input = createContractsInput();
  input.daily.difficulties.simple.initialOffers[0].objective.type = "item_use_count";

  assert.throws(
    () => parseDiceContractsData(input),
    /contracts\.daily\.difficulties\.simple\.initialOffers\[0\]\.objective\.type must be one of/i,
  );
});

test("parseDiceContractsData rejects invalid Contract Master image URLs", () => {
  const input = createContractsInput();
  input.panel.imageUrl = "not-a-url";

  assert.throws(
    () => parseDiceContractsData(input),
    /contracts\.panel\.imageUrl must be a valid URL/i,
  );
});

test("parseDiceContractsData rejects duplicate ids across cadence difficulty pools", () => {
  const input = createContractsInput();
  input.weekly.difficulties.simple.initialOffers[0].id =
    input.daily.difficulties.simple.initialOffers[0].id;

  assert.throws(() => parseDiceContractsData(input), /Duplicate contract id/i);
});

test("parseDiceContractsData rejects authored per-offer rewards", () => {
  const input = createContractsInput() as ContractsInput & {
    daily: ContractsCadenceInput & {
      difficulties: {
        simple: ContractsDifficultyInput & {
          initialOffers: Array<ContractOfferInput & { reward?: { pips?: number; fame?: number } }>;
        };
        serious: ContractsDifficultyInput;
        brutal: ContractsDifficultyInput;
      };
    };
  };
  input.daily.difficulties.simple.initialOffers[0].reward = { fame: 5 };

  assert.throws(
    () => parseDiceContractsData(input),
    /contracts\.daily\.difficulties\.simple\.initialOffers\[0\]\.reward is not supported/i,
  );
});

test("parseDiceContractsData rejects empty refill pools", () => {
  const input = createContractsInput();
  input.daily.difficulties.simple.refillOffers = [];

  assert.throws(
    () => parseDiceContractsData(input),
    /contracts\.daily\.difficulties\.simple\.refillOffers must include at least 1 offer/i,
  );
});

test("parseDiceContractsData rejects non-monotonic difficulty rewards", () => {
  const input = createContractsInput();
  input.daily.difficulties.serious.rewardPips = input.daily.difficulties.simple.rewardPips;

  assert.throws(
    () => parseDiceContractsData(input),
    /contracts\.daily\.difficulties rewardPips must increase strictly/i,
  );
});

test("parseDiceContractsData rejects contract previews that exceed Discord message limits", () => {
  const input = createContractsInput();
  input.daily.difficulties.simple.initialOffers[0].description = "A".repeat(2_100);

  assert.throws(
    () => parseDiceContractsData(input),
    /contracts\.daily\.difficulties\.simple\.initialOffers\[0\] as rendered in \/contracts must be <= 2000 characters/i,
  );
});

test("parseDiceItems rejects passive effects on consumable items", () => {
  const item = createDiceItemInput();
  item.consumable = true;

  assert.throws(
    () => parseDiceItems([item]),
    /Passive item padded-bracers must set consumable to false/i,
  );
});

test("parseDiceItems accepts repeatable passive pricing and prerequisites", () => {
  const parsed = parseDiceItems([
    {
      id: "idle-dynamo",
      name: "Idle Dynamo",
      description:
        "Passive upgrade: unlocks personal Dice charge at +1 every 2 idle minutes, up to x10.",
      pricePips: 50,
      consumable: false,
      effect: {
        type: "passive-personal-charge-unlock",
        minutesPerMultiplier: 2,
        maxMultiplier: 10,
      },
    },
    {
      id: "starter-coil",
      name: "Starter Coil",
      description: "Passive upgrade: each copy makes personal Dice charge build 25% faster.",
      pricePips: 300,
      consumable: false,
      repeatablePricing: {
        priceIncreasePipsPerOwned: 300,
      },
      requiresItemId: "idle-dynamo",
      effect: {
        type: "passive-personal-charge-speed-bonus",
        fasterPercent: 0.25,
      },
    },
  ]);

  assert.deepEqual(parsed[1]?.repeatablePricing, {
    priceIncreasePipsPerOwned: 300,
  });
  assert.equal(parsed[1]?.requiresItemId, "idle-dynamo");
});

test("parseDiceItems rejects repeatable pricing on non-passive items", () => {
  assert.throws(
    () =>
      parseDiceItems([
        {
          id: "dice-revolver",
          name: "Dice Revolver",
          description: "Your next 6 /roll uses roll twice.",
          pricePips: 6,
          consumable: true,
          repeatablePricing: {
            priceIncreasePipsPerOwned: 6,
          },
          effect: {
            type: "double-roll-uses",
            uses: 6,
          },
        },
      ]),
    /Only passive upgrades may declare repeatablePricing, but dice-revolver is not passive/i,
  );
});

test("parseDiceItems rejects repeatable pricing on passive effects that do not stack", () => {
  assert.throws(
    () =>
      parseDiceItems([
        {
          id: "padded-bracers",
          name: "Padded Bracers",
          description: "Passive upgrade: reduce PvP loser lockout by 15%.",
          pricePips: 900,
          consumable: false,
          repeatablePricing: {
            priceIncreasePipsPerOwned: 900,
          },
          effect: {
            type: "passive-pvp-loser-lockout-reduction",
            reductionPercent: 0.15,
            minimumMinutes: 15,
          },
        },
      ]),
    /Only stacking passive upgrades may declare repeatablePricing, but padded-bracers does not stack/i,
  );
});

test("parseDiceItems rejects self prerequisites", () => {
  assert.throws(
    () =>
      parseDiceItems([
        {
          ...createDiceItemInput(),
          requiresItemId: "padded-bracers",
        },
      ]),
    /Item padded-bracers cannot require itself/i,
  );
});

test("parseDiceItems rejects unknown prerequisites", () => {
  assert.throws(
    () =>
      parseDiceItems([
        {
          ...createDiceItemInput(),
          id: "starter-coil",
          name: "Starter Coil",
          description: "Passive upgrade: each copy makes personal Dice charge build 25% faster.",
          repeatablePricing: {
            priceIncreasePipsPerOwned: 300,
          },
          requiresItemId: "idle-dynamo",
          effect: {
            type: "passive-personal-charge-speed-bonus",
            fasterPercent: 0.25,
          },
        },
      ]),
    /Item starter-coil requires unknown item 'idle-dynamo'/i,
  );
});

test("parseDiceItems rejects descriptions that overflow a single-item inventory page", () => {
  const item = createDiceItemInput();
  item.description = "A".repeat(2_100);

  assert.throws(
    () => parseDiceItems([item]),
    /single-item \/inventory page must be <= 2000 characters/i,
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

test("validateRandomEventConsumableRewards rejects unknown staged success item ids", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimPolicy = "first-click";
  scenario.outcomes = [];
  scenario.flow = {
    type: "solo-ladder",
    stages: [
      {
        id: "stage-one",
        label: "Open crate",
        prompt: "Pry the crate open.",
        actionLabel: "Open crate",
        rollChallenge: {
          id: "crate-check",
          mode: "single-step",
          steps: [
            {
              id: "crate-step",
              label: "Roll 2+ on d6",
              source: { type: "static-die", sides: 6 },
              target: 2,
              comparator: "gte",
            },
          ],
        },
        successMessage: "The crate cracks open.",
        successEffects: [
          {
            type: "consumable-item",
            itemId: "missing-stage-item",
            quantity: 1,
          },
        ],
        failureMessage: "The lid slams shut.",
        failureEffects: [],
      },
    ],
  };

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
    /stage stage-one successEffects references unknown consumable item 'missing-stage-item'/i,
  );
});

test("validateRandomEventConsumableRewards rejects passive staged failure item rewards", () => {
  const scenario = createRandomEventScenarioInput();
  scenario.claimPolicy = "first-click";
  scenario.outcomes = [];
  scenario.flow = {
    type: "solo-ladder",
    stages: [
      {
        id: "stage-one",
        label: "Open crate",
        prompt: "Pry the crate open.",
        actionLabel: "Open crate",
        rollChallenge: {
          id: "crate-check",
          mode: "single-step",
          steps: [
            {
              id: "crate-step",
              label: "Roll 5+ on d6",
              source: { type: "static-die", sides: 6 },
              target: 5,
              comparator: "gte",
            },
          ],
        },
        successMessage: "The crate cracks open.",
        successEffects: [{ type: "currency", minAmount: 1, maxAmount: 1 }],
        failureMessage: "The lid slams shut.",
        failureEffects: [
          {
            type: "consumable-item",
            itemId: "padded-bracers",
            quantity: 1,
          },
        ],
      },
    ],
  };

  const parsedScenarios = parseRandomEventScenarios([scenario]);
  const parsedItems = parseDiceItems([createDiceItemInput()]);

  assert.throws(
    () => validateRandomEventConsumableRewards(parsedScenarios, parsedItems),
    /stage stage-one failureEffects must reference a consumable item/i,
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
