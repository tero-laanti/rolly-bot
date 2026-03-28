import type {
  DiceContractData,
  DiceContractObjectiveData,
  DiceContractObjectiveType,
  DiceContractRewardData,
} from "../../../rolly-data/types";

export type ContractCadence = "daily" | "weekly";

export type ContractObjectiveType = DiceContractObjectiveType;

export type ContractObjective = DiceContractObjectiveData;

export type ContractReward = Required<DiceContractRewardData>;

export type ContractDefinition = {
  id: string;
  title: string;
  description: string;
  cadence: ContractCadence;
  objective: ContractObjective;
  reward: ContractReward;
};

export const contractFromData = (
  cadence: ContractCadence,
  data: DiceContractData,
): ContractDefinition => ({
  id: data.id,
  title: data.title,
  description: data.description,
  cadence,
  objective: data.objective,
  reward: {
    fame: data.reward.fame ?? 0,
    pips: data.reward.pips ?? 0,
  },
});

export type ContractCatalog = {
  daily: ContractDefinition[];
  weekly: ContractDefinition[];
};
