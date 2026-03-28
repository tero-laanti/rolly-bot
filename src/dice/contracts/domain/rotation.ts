import type {
  ContractCadence,
  ContractCatalog,
  ContractDefinition,
  ContractDifficulty,
  ContractOffer,
} from "./types";

export const contractDifficulties: ContractDifficulty[] = ["simple", "serious", "brutal"];
export const dailyActiveCount = 3;
export const weeklyActiveCount = 2;

const formatDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseResetWindowDate = (resetWindow: string): Date => {
  const [year, month, day] = resetWindow.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
};

export const getContractResetWindow = (cadence: ContractCadence, now: Date): string => {
  if (cadence === "daily") {
    return formatDateKey(now);
  }

  const day = now.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() + offsetToMonday);
  return formatDateKey(monday);
};

export const getDailyPeriodKey = (now: Date): string => getContractResetWindow("daily", now);

export const getWeeklyPeriodKey = (now: Date): string => getContractResetWindow("weekly", now);

export const getContractResetAt = (cadence: ContractCadence, resetWindow: string): Date => {
  const resetAt = parseResetWindowDate(resetWindow);
  resetAt.setUTCDate(resetAt.getUTCDate() + (cadence === "daily" ? 1 : 7));
  return resetAt;
};

export const getContractRotationResetAt = (cadence: ContractCadence, resetWindow: string): Date => {
  return getContractResetAt(cadence, resetWindow);
};

const stringHash = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const nextRandom = (state: number): number => {
  let value = state || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
};

export const deterministicShuffle = <T>(items: readonly T[], seedSource: string): T[] => {
  const shuffled = [...items];
  let state = stringHash(seedSource);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = nextRandom(state);
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
};

export const findDeterministicOffer = (
  offers: readonly ContractOffer[],
  seedSource: string,
  excludedIds: ReadonlySet<string> = new Set(),
): ContractOffer | null => {
  const candidates = offers.filter((offer) => !excludedIds.has(offer.id));
  if (candidates.length < 1) {
    return null;
  }

  return deterministicShuffle(candidates, seedSource)[0]!;
};

export const pickDeterministicOffer = (
  offers: readonly ContractOffer[],
  seedSource: string,
  excludedIds: ReadonlySet<string> = new Set(),
): ContractOffer => {
  const offer = findDeterministicOffer(offers, seedSource, excludedIds);
  if (!offer) {
    throw new Error(`No contract offers remain for seed ${seedSource}.`);
  }

  return offer;
};

const pickContracts = (
  contracts: ContractDefinition[],
  count: number,
  seedSource: string,
): ContractDefinition[] => {
  if (contracts.length <= count) {
    return [...contracts];
  }

  return deterministicShuffle(contracts, seedSource).slice(0, count);
};

export const buildContractRotation = (
  catalog:
    | Pick<ContractCatalog, "daily" | "weekly">
    | { daily: ContractDefinition[]; weekly: ContractDefinition[] },
  now: Date,
): {
  daily: { cadence: "daily"; periodKey: string; contracts: ContractDefinition[] };
  weekly: { cadence: "weekly"; periodKey: string; contracts: ContractDefinition[] };
} => {
  const dailyPeriodKey = getDailyPeriodKey(now);
  const weeklyPeriodKey = getWeeklyPeriodKey(now);

  return {
    daily: {
      cadence: "daily",
      periodKey: dailyPeriodKey,
      contracts: pickContracts(
        Array.isArray(catalog.daily) ? (catalog.daily as ContractDefinition[]) : [],
        dailyActiveCount,
        `daily-${dailyPeriodKey}`,
      ),
    },
    weekly: {
      cadence: "weekly",
      periodKey: weeklyPeriodKey,
      contracts: pickContracts(
        Array.isArray(catalog.weekly) ? (catalog.weekly as ContractDefinition[]) : [],
        weeklyActiveCount,
        `weekly-${weeklyPeriodKey}`,
      ),
    },
  };
};
