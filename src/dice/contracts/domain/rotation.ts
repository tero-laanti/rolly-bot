import type { ContractCadence, ContractCatalog, ContractDefinition } from "./types";

export type ContractRotation = {
  cadence: ContractCadence;
  periodKey: string;
  contracts: ContractDefinition[];
};

export const dailyActiveCount = 3;
export const weeklyActiveCount = 2;

const formatDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parsePeriodKeyDate = (periodKey: string): Date => {
  const [year, month, day] = periodKey.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
};

export const getDailyPeriodKey = (now: Date): string => formatDateKey(now);

export const getDailyResetAt = (periodKey: string): Date => {
  const resetAt = parsePeriodKeyDate(periodKey);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);
  return resetAt;
};

export const getWeeklyPeriodKey = (now: Date): string => {
  // Monday 00:00 UTC is the reset boundary. Find the most recent Monday and use that date.
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() + offsetToMonday);
  return formatDateKey(monday);
};

export const getWeeklyResetAt = (periodKey: string): Date => {
  const resetAt = parsePeriodKeyDate(periodKey);
  resetAt.setUTCDate(resetAt.getUTCDate() + 7);
  return resetAt;
};

export const getContractRotationResetAt = (cadence: ContractCadence, periodKey: string): Date => {
  return cadence === "daily" ? getDailyResetAt(periodKey) : getWeeklyResetAt(periodKey);
};

const stringHash = (value: string): number => {
  // Simple 32-bit FNV-1a hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const nextRandom = (state: number): number => {
  // xorshift32
  let x = state || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
};

const deterministicShuffle = <T>(items: T[], seedSource: string): T[] => {
  const result = [...items];
  let state = stringHash(seedSource);
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = nextRandom(state);
    const swapIndex = state % (i + 1);
    [result[i], result[swapIndex]] = [result[swapIndex], result[i]];
  }
  return result;
};

const pickContracts = (
  contracts: ContractDefinition[],
  count: number,
  seed: string,
): ContractDefinition[] => {
  if (contracts.length <= count) {
    return [...contracts];
  }
  const shuffled = deterministicShuffle(contracts, seed);
  return shuffled.slice(0, count);
};

export const buildContractRotation = (
  catalog: ContractCatalog,
  now: Date,
): { daily: ContractRotation; weekly: ContractRotation } => {
  const dailyPeriodKey = getDailyPeriodKey(now);
  const weeklyPeriodKey = getWeeklyPeriodKey(now);

  return {
    daily: {
      cadence: "daily",
      periodKey: dailyPeriodKey,
      contracts: pickContracts(catalog.daily, dailyActiveCount, `daily-${dailyPeriodKey}`),
    },
    weekly: {
      cadence: "weekly",
      periodKey: weeklyPeriodKey,
      contracts: pickContracts(catalog.weekly, weeklyActiveCount, `weekly-${weeklyPeriodKey}`),
    },
  };
};
