import fs from "node:fs";
import {
  describeRollyDataSource,
  getExampleRollyDataDir,
  getRollyDataFilePath,
  resolveRollyDataSource,
} from "./paths";
import type {
  DiceAchievementData,
  DiceCasinoData,
  DiceBalanceData,
  DiceItemData,
  LoadedRollyData,
  RollyDataSource,
} from "./types";
import {
  parseDiceAchievements,
  parseDiceCasinoData,
  parseDiceBalance,
  parseDiceItems,
  parseRandomEventScenarios,
} from "./validate";
import type { RandomEventScenario } from "../dice/random-events/domain/content";

const achievementsFileName = "achievements.json";
const casinoV1FileName = "casino.v1.json";
const diceBalanceFileName = "dice-balance.json";
const itemsV1FileName = "items.v1.json";
const randomEventsV1FileName = "random-events.v1.json";
const allowExampleDataEnvName = "ROLLY_ALLOW_EXAMPLE_DATA";

let cachedRollyData: LoadedRollyData | null = null;

const isExampleDataAllowed = (): boolean => {
  const rawValue = process.env[allowExampleDataEnvName]?.trim().toLowerCase();
  return rawValue === "1" || rawValue === "true" || rawValue === "yes" || rawValue === "on";
};

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

const loadRollyData = (): LoadedRollyData => {
  const source = resolveRollyDataSource();
  if (
    (source.kind === "example" || source.dir === getExampleRollyDataDir()) &&
    !isExampleDataAllowed()
  ) {
    throw new Error(
      `Refusing to start with public example data from ${source.dir}. Set ${allowExampleDataEnvName}=true only for local development, or provide private game data via ROLLY_DATA_DIR or ./rolly-data.`,
    );
  }

  return {
    source,
    achievements: parseDiceAchievements(readJsonFile(source, achievementsFileName)),
    casinoV1: parseDiceCasinoData(readJsonFile(source, casinoV1FileName)),
    diceBalance: parseDiceBalance(readJsonFile(source, diceBalanceFileName)),
    itemsV1: parseDiceItems(readJsonFile(source, itemsV1FileName)),
    randomEventsV1: parseRandomEventScenarios(readJsonFile(source, randomEventsV1FileName)),
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

export const getDiceCasinoData = (): DiceCasinoData => {
  return getRollyData().casinoV1;
};

export const getDiceItemsData = (): DiceItemData[] => {
  return getRollyData().itemsV1;
};

export const getRandomEventContentPackV1 = (): RandomEventScenario[] => {
  return getRollyData().randomEventsV1;
};

export const getRollyDataSourceDescription = (): string => {
  return describeRollyDataSource(getRollyData().source);
};
