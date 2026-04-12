import fs from "node:fs";
import { describeRollyDataSource, getRollyDataFilePath, resolveRollyDataSource } from "./paths";
import type {
  BeginnerOnboardingV1Data,
  DiceAchievementData,
  DiceCasinoData,
  DiceBalanceData,
  DiceContractsData,
  DiceItemData,
  DicePvpData,
  DiceRaidsData,
  DiceRandomEventBalanceData,
  DiceWorldBossData,
  IntroPostsV1Data,
  LoadedRollyData,
  RollyDataSource,
} from "./types";
import {
  parseBeginnerOnboardingV1Data,
  parseDiceAchievements,
  parseDiceCasinoData,
  parseDiceBalance,
  parseDiceContractsData,
  parseDicePvpData,
  parseRaidsData,
  parseDiceItems,
  parseWorldBossData,
  parseIntroPostsV1Data,
  parseRandomEventBalance,
  parseRandomEventScenarios,
  validateRandomEventConsumableRewards,
} from "./validate";
import type { RandomEventScenario } from "../dice/random-events/domain/content";

const achievementsFileName = "achievements.json";
const beginnerOnboardingV1FileName = "beginner-onboarding.v1.json";
const casinoV1FileName = "casino.v1.json";
const contractsV2FileName = "contracts.v2.json";
const diceBalanceFileName = "dice-balance.json";
const introPostsV1FileName = "intro-posts.v1.json";
const itemsV1FileName = "items.v1.json";
const pvpFileName = "pvp.json";
const raidsFileName = "raids.json";
const worldBossFileName = "world-boss.v1.json";
const randomEventBalanceFileName = "random-events-balance.json";
const randomEventsV1FileName = "random-events.v1.json";

let cachedRollyData: LoadedRollyData | null = null;

const readJsonFile = (source: RollyDataSource, fileName: string): unknown => {
  const filePath = getRollyDataFilePath(source, fileName);
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath} as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const readOptionalJsonFile = (source: RollyDataSource, fileName: string): unknown | null => {
  const filePath = getRollyDataFilePath(source, fileName);
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return null;
    }

    throw new Error(
      `Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath} as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const loadContracts = (source: RollyDataSource): DiceContractsData | null => {
  const rawContracts = readOptionalJsonFile(source, contractsV2FileName);
  if (rawContracts === null) {
    if (source.kind === "local") {
      return null;
    }

    throw new Error(
      `Required rolly-data file is missing: ${getRollyDataFilePath(source, contractsV2FileName)}`,
    );
  }

  return parseDiceContractsData(rawContracts);
};

const loadBeginnerOnboarding = (source: RollyDataSource): BeginnerOnboardingV1Data | null => {
  const rawBeginnerOnboarding = readOptionalJsonFile(source, beginnerOnboardingV1FileName);
  if (rawBeginnerOnboarding === null) {
    return null;
  }

  return parseBeginnerOnboardingV1Data(rawBeginnerOnboarding);
};

const loadRollyData = (): LoadedRollyData => {
  const source = resolveRollyDataSource();
  const itemsV1 = parseDiceItems(readJsonFile(source, itemsV1FileName));
  const randomEventsV1 = parseRandomEventScenarios(readJsonFile(source, randomEventsV1FileName));
  validateRandomEventConsumableRewards(randomEventsV1, itemsV1);

  return {
    source,
    achievements: parseDiceAchievements(readJsonFile(source, achievementsFileName)),
    beginnerOnboardingV1: loadBeginnerOnboarding(source),
    casinoV1: parseDiceCasinoData(readJsonFile(source, casinoV1FileName)),
    contracts: loadContracts(source),
    diceBalance: parseDiceBalance(readJsonFile(source, diceBalanceFileName)),
    introPostsV1: parseIntroPostsV1Data(readJsonFile(source, introPostsV1FileName)),
    itemsV1,
    pvp: parseDicePvpData(readJsonFile(source, pvpFileName)),
    randomEventBalance: parseRandomEventBalance(readJsonFile(source, randomEventBalanceFileName)),
    raids: parseRaidsData(readJsonFile(source, raidsFileName)),
    worldBoss: parseWorldBossData(readJsonFile(source, worldBossFileName)),
    randomEventsV1,
  };
};

export const primeRollyData = (): LoadedRollyData => {
  cachedRollyData = loadRollyData();
  return cachedRollyData;
};

export const getRollyData = (): LoadedRollyData => {
  return cachedRollyData ?? primeRollyData();
};

export const getDiceAchievementsData = (): DiceAchievementData[] => {
  return getRollyData().achievements;
};

export const getOptionalBeginnerOnboardingV1Data = (): BeginnerOnboardingV1Data | null => {
  return getRollyData().beginnerOnboardingV1;
};

export const getDiceBalanceData = (): DiceBalanceData => {
  return getRollyData().diceBalance;
};

export const getDicePvpData = (): DicePvpData => {
  return getRollyData().pvp;
};

export const getRandomEventBalanceData = (): DiceRandomEventBalanceData => {
  return getRollyData().randomEventBalance;
};

export const getDiceRaidsData = (): DiceRaidsData => {
  return getRollyData().raids;
};

export const getWorldBossData = (): DiceWorldBossData => {
  return getRollyData().worldBoss;
};

export const getDiceCasinoData = (): DiceCasinoData => {
  return getRollyData().casinoV1;
};

export const getDiceContractsData = (): DiceContractsData => {
  const loaded = getRollyData();
  if (loaded.contracts === null) {
    throw new Error(
      `Contracts data is unavailable from ${describeRollyDataSource(loaded.source)}. Add contracts.v2.json to enable contracts.`,
    );
  }

  return loaded.contracts;
};

export const getOptionalDiceContractsData = (): DiceContractsData | null => {
  return getRollyData().contracts;
};

export const getDiceItemsData = (): DiceItemData[] => {
  return getRollyData().itemsV1;
};

export const getIntroPostsV1Data = (): IntroPostsV1Data => {
  return getRollyData().introPostsV1;
};

export const getRandomEventContentPackV1 = (): RandomEventScenario[] => {
  return getRollyData().randomEventsV1;
};

export const getRollyDataSourceDescription = (): string => {
  return describeRollyDataSource(getRollyData().source);
};
