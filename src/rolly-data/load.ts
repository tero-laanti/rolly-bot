import fs from "node:fs";
import { describeRollyDataSource, getRollyDataFilePath, resolveRollyDataSource } from "./paths";
import type {
  DiceAchievementData,
  DiceCasinoData,
  DiceBalanceData,
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
  parseDicePvpData,
  parseDiceItems,
  parseDiceRaidsData,
  parseIntroPostsV1Data,
  parseRandomEventBalance,
  parseRandomEventScenarios,
} from "./validate";
import type { RandomEventScenario } from "../dice/random-events/domain/content";

const achievementsFileName = "achievements.json";
const casinoV1FileName = "casino.v1.json";
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

const loadRollyData = (): LoadedRollyData => {
  const source = resolveRollyDataSource();
  return {
    source,
    achievements: parseDiceAchievements(readJsonFile(source, achievementsFileName)),
    casinoV1: parseDiceCasinoData(readJsonFile(source, casinoV1FileName)),
    diceBalance: parseDiceBalance(readJsonFile(source, diceBalanceFileName)),
    introPostsV1: parseIntroPostsV1Data(readJsonFile(source, introPostsV1FileName)),
    itemsV1: parseDiceItems(readJsonFile(source, itemsV1FileName)),
    pvp: parseDicePvpData(readJsonFile(source, pvpFileName)),
    randomEventBalance: parseRandomEventBalance(readJsonFile(source, randomEventBalanceFileName)),
    raids: parseDiceRaidsData(readJsonFile(source, raidsFileName)),
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
