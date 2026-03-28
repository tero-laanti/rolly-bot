import type {
  ContractsCatalogReader,
  ContractsRotationRepository,
  ContractsRotationResolver,
} from "../ports";
import {
  buildContractRotation,
  dailyActiveCount,
  getDailyPeriodKey,
  getWeeklyPeriodKey,
  weeklyActiveCount,
} from "../../domain/rotation";
import type { ContractCadence, ContractDefinition } from "../../domain/types";

const parsePeriodKeyDate = (periodKey: string): Date => {
  const [year, month, day] = periodKey.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
};

const getResetAt = (cadence: ContractCadence, periodKey: string): Date => {
  const periodStart = parsePeriodKeyDate(periodKey);
  const resetAt = new Date(periodStart.getTime());
  resetAt.setUTCDate(resetAt.getUTCDate() + (cadence === "daily" ? 1 : 7));
  return resetAt;
};

type Dependencies = {
  catalogReader: ContractsCatalogReader;
  rotationRepository: ContractsRotationRepository;
};

export const createResolveContractsRotationUseCase = ({
  catalogReader,
  rotationRepository,
}: Dependencies): ContractsRotationResolver => {
  const resolveActiveRotation: ContractsRotationResolver["resolveActiveRotation"] = (now) => {
    const catalog = catalogReader.getCatalog();
    const contractById = new Map<string, ContractDefinition>();
    for (const contract of [...catalog.daily, ...catalog.weekly]) {
      contractById.set(contract.id, contract);
    }

    const dailyPeriodKey = getDailyPeriodKey(now);
    const weeklyPeriodKey = getWeeklyPeriodKey(now);

    const existingDaily = rotationRepository.getRotation("daily", dailyPeriodKey);
    const existingWeekly = rotationRepository.getRotation("weekly", weeklyPeriodKey);

    const freshRotation =
      !existingDaily || !existingWeekly ? buildContractRotation(catalog, now) : null;

    const resolveContractsForRecord = (
      record: typeof existingDaily,
      expectedCount: number,
    ): ContractDefinition[] | null => {
      if (!record) return null;
      if (record.contractIds.length > expectedCount) {
        throw new Error(
          `Persisted ${record.cadence} contract rotation for ${record.periodKey} is invalid`,
        );
      }
      const contracts = record.contractIds
        .map((id) => contractById.get(id))
        .filter((value): value is ContractDefinition => Boolean(value));
      if (contracts.length !== record.contractIds.length) {
        throw new Error(
          `Persisted ${record.cadence} contract rotation for ${record.periodKey} no longer matches the catalog`,
        );
      }
      return contracts;
    };

    const ensureRotation = (
      cadence: ContractCadence,
      periodKey: string,
      record: typeof existingDaily,
      expectedCount: number,
      fallbackContracts: ContractDefinition[],
    ) => {
      const existingContracts = resolveContractsForRecord(record, expectedCount);
      if (existingContracts) {
        return { cadence, periodKey, contracts: existingContracts };
      }

      const resetAt = getResetAt(cadence, periodKey);
      const activatedAt = now;
      rotationRepository.saveRotation({
        cadence,
        periodKey,
        contractIds: fallbackContracts.map((contract) => contract.id),
        activatedAt,
        resetAt,
      });
      return { cadence, periodKey, contracts: fallbackContracts };
    };

    const dailyContracts =
      freshRotation?.daily.contracts ?? catalog.daily.slice(0, dailyActiveCount);
    const weeklyContracts =
      freshRotation?.weekly.contracts ?? catalog.weekly.slice(0, weeklyActiveCount);

    const daily = ensureRotation(
      "daily",
      dailyPeriodKey,
      existingDaily,
      dailyActiveCount,
      dailyContracts,
    );
    const weekly = ensureRotation(
      "weekly",
      weeklyPeriodKey,
      existingWeekly,
      weeklyActiveCount,
      weeklyContracts,
    );

    return { daily, weekly };
  };

  return { resolveActiveRotation };
};
