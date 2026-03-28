import type { ContractsCatalogReader } from "../../application/ports";
import { getDiceContractsData, getOptionalDiceContractsData } from "../../../../rolly-data/load";
import { contractFromData } from "../../domain/types";
import type { DiceContractData, DiceContractsData } from "../../../../rolly-data/types";

const mapContractsCatalog = (
  data: DiceContractsData,
): ReturnType<ContractsCatalogReader["getCatalog"]> => {
  return {
    daily: data.daily.map((contract: DiceContractData) => contractFromData("daily", contract)),
    weekly: data.weekly.map((contract: DiceContractData) => contractFromData("weekly", contract)),
  };
};

export const createRollyDataContractsCatalogReader = (): ContractsCatalogReader => {
  const getCatalog: ContractsCatalogReader["getCatalog"] = () => {
    return mapContractsCatalog(getDiceContractsData());
  };

  return { getCatalog };
};

export const createOptionalRollyDataContractsCatalogReader = (): ContractsCatalogReader | null => {
  const data = getOptionalDiceContractsData();
  if (data === null) {
    return null;
  }

  return {
    getCatalog: () => mapContractsCatalog(data),
  };
};
