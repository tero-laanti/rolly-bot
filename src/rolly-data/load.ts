import fs from "node:fs";
import { describeRollyDataSource, getRollyDataFilePath, resolveRollyDataSource } from "./paths";
import type {
  DiceAchievementData,
  DiceCasinoData,
  DiceBalanceData,
  DiceContractsV1Data,
  DiceItemData,
  DicePvpData,
  DiceRandomEventBalanceData,
  DiceRaidData,
  IntroPostsV1Data,
  LoadedRollyData,
  RollyDataSource,
} from "./types";
import {
  parseDiceAchievements,
  parseDiceCasinoData,
  parseDiceBalance,
  parseDiceContractsV1Data,
  parseDicePvpData,
  parseDiceItems,
  parseDiceRaidsData,
  parseIntroPostsV1Data,
  parseRandomEventBalance,
  parseRandomEventScenarios,
  validateRandomEventConsumableRewards,
} from "./validate";
import type { RandomEventScenario } from "../dice/random-events/domain/content";

const achievementsFileName = "achievements.json";
const casinoV1FileName = "casino.v1.json";
const contractsV1FileName = "contracts.v1.json";
const diceBalanceFileName = "dice-balance.json";
const introPostsV1FileName = "intro-posts.v1.json";
const itemsV1FileName = "items.v1.json";
const pvpFileName = "pvp.json";
const raidsFileName = "raids.json";
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

const loadContractsV1 = (source: RollyDataSource): DiceContractsV1Data | null => {
  const rawContracts = readOptionalJsonFile(source, contractsV1FileName);
  if (rawContracts === null) {
    if (source.kind === "local") {
      return null;
    }

    throw new Error(
      `Required rolly-data file is missing: ${getRollyDataFilePath(source, contractsV1FileName)}`,
    );
  }

  return parseDiceContractsV1Data(rawContracts);
};

const loadRollyData = (): LoadedRollyData => {
  const source = resolveRollyDataSource();
  const itemsV1 = parseDiceItems(readJsonFile(source, itemsV1FileName));
  const randomEventsV1 = parseRandomEventScenarios(readJsonFile(source, randomEventsV1FileName));
  validateRandomEventConsumableRewards(randomEventsV1, itemsV1);

  return {
    source,
    achievements: parseDiceAchievements(readJsonFile(source, achievementsFileName)),
    casinoV1: parseDiceCasinoData(readJsonFile(source, casinoV1FileName)),
    contractsV1: loadContractsV1(source),
    diceBalance: parseDiceBalance(readJsonFile(source, diceBalanceFileName)),
    introPostsV1: parseIntroPostsV1Data(readJsonFile(source, introPostsV1FileName)),
    itemsV1,
    pvp: parseDicePvpData(readJsonFile(source, pvpFileName)),
    randomEventBalance: parseRandomEventBalance(readJsonFile(source, randomEventBalanceFileName)),
    raids: parseDiceRaidsData(readJsonFile(source, raidsFileName)),
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

export const getDiceBalanceData = (): DiceBalanceData => {
  return getRollyData().diceBalance;
};

export const getDicePvpData = (): DicePvpData => {
  return getRollyData().pvp;
};

export const getRandomEventBalanceData = (): DiceRandomEventBalanceData => {
  return getRollyData().randomEventBalance;
};

export const getDiceRaidData = (): DiceRaidData => {
  return getRollyData().raids;
};

export const getDiceCasinoData = (): DiceCasinoData => {
  return getRollyData().casinoV1;
};

export const getDiceContractsV1Data = (): DiceContractsV1Data => {
  const loaded = getRollyData();
  if (loaded.contractsV1 === null) {
    throw new Error(
      `Contracts data is unavailable from ${describeRollyDataSource(loaded.source)}. Add contracts.v1.json to enable contracts.`,
    );
  }

  return loaded.contractsV1;
};

export const getOptionalDiceContractsV1Data = (): DiceContractsV1Data | null => {
  return getRollyData().contractsV1;
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
