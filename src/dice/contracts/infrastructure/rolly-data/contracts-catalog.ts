import type { ContractsCatalogReader } from "../../application/ports";
import { getDiceContractsData, getOptionalDiceContractsData } from "../../../../rolly-data/load";
import { contractCatalogFromData } from "../../domain/types";

export const createRollyDataContractsCatalogReader = (): ContractsCatalogReader => {
  return {
    getCatalog: () => contractCatalogFromData(getDiceContractsData()),
  };
};

export const createOptionalRollyDataContractsCatalogReader = (): ContractsCatalogReader | null => {
  const data = getOptionalDiceContractsData();
  if (data === null) {
    return null;
  }

  return {
    getCatalog: () => contractCatalogFromData(data),
  };
};
