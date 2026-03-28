import type { ContractsCatalogReader } from "../../application/ports";
import {
  getDiceContractsV1Data,
  getOptionalDiceContractsV1Data,
} from "../../../../rolly-data/load";
import { contractFromData } from "../../domain/types";
import type { DiceContractData, DiceContractsV1Data } from "../../../../rolly-data/types";

const mapContractsCatalog = (
  data: DiceContractsV1Data,
): ReturnType<ContractsCatalogReader["getCatalog"]> => {
  return {
    daily: data.daily.map((contract: DiceContractData) => contractFromData("daily", contract)),
    weekly: data.weekly.map((contract: DiceContractData) => contractFromData("weekly", contract)),
  };
};

export const createRollyDataContractsCatalogReader = (): ContractsCatalogReader => {
  const getCatalog: ContractsCatalogReader["getCatalog"] = () => {
    return mapContractsCatalog(getDiceContractsV1Data());
  };

  return { getCatalog };
};

export const createOptionalRollyDataContractsCatalogReader = (): ContractsCatalogReader | null => {
  const data = getOptionalDiceContractsV1Data();
  if (data === null) {
    return null;
  }

  return {
    getCatalog: () => mapContractsCatalog(data),
  };
};
