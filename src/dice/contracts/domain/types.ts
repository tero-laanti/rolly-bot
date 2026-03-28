import type {
  DiceContractData,
  DiceContractDifficulty,
  DiceContractObjectiveData,
  DiceContractObjectiveType,
  DiceContractRewardData,
  DiceContractsCadenceData,
  DiceContractsData,
  DiceContractsDifficultyData,
  DiceContractsPanelData,
} from "../../../rolly-data/types";

export type ContractCadence = "daily" | "weekly";

export type ContractDifficulty = DiceContractDifficulty;

export type ContractObjectiveType = DiceContractObjectiveType;

export type ContractObjective = DiceContractObjectiveData;

export type ContractPanel = DiceContractsPanelData;

export type ContractReward = Required<DiceContractRewardData>;

export type ContractOffer = {
  id: string;
  title: string;
  description: string;
  cadence: ContractCadence;
  difficulty: ContractDifficulty;
  objective: ContractObjective;
  rewardPips: number;
};

export type ContractDifficultyPool = {
  label: string;
  rewardPips: number;
  initialOffers: ContractOffer[];
  refillOffers: ContractOffer[];
};

export type ContractCadenceCatalog = {
  label: string;
  chooserTitle: string;
  chooserDescription: string;
  difficulties: Record<ContractDifficulty, ContractDifficultyPool>;
};

export type ContractCatalog = {
  panel: ContractPanel;
  daily: ContractCadenceCatalog;
  weekly: ContractCadenceCatalog;
};

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

const contractOfferFromData = (
  cadence: ContractCadence,
  difficulty: ContractDifficulty,
  rewardPips: number,
  data: DiceContractData,
): ContractOffer => ({
  id: data.id,
  title: data.title,
  description: data.description,
  cadence,
  difficulty,
  objective: data.objective,
  rewardPips,
});

const contractDifficultyPoolFromData = (
  cadence: ContractCadence,
  difficulty: ContractDifficulty,
  data: DiceContractsDifficultyData,
): ContractDifficultyPool => ({
  label: data.label,
  rewardPips: data.rewardPips,
  initialOffers: data.initialOffers.map((offer) =>
    contractOfferFromData(cadence, difficulty, data.rewardPips, offer),
  ),
  refillOffers: data.refillOffers.map((offer) =>
    contractOfferFromData(cadence, difficulty, data.rewardPips, offer),
  ),
});

const contractCadenceCatalogFromData = (
  cadence: ContractCadence,
  data: DiceContractsCadenceData,
): ContractCadenceCatalog => ({
  label: data.label,
  chooserTitle: data.chooserTitle,
  chooserDescription: data.chooserDescription,
  difficulties: {
    simple: contractDifficultyPoolFromData(cadence, "simple", data.difficulties.simple),
    serious: contractDifficultyPoolFromData(cadence, "serious", data.difficulties.serious),
    brutal: contractDifficultyPoolFromData(cadence, "brutal", data.difficulties.brutal),
  },
});

export const contractCatalogFromData = (data: DiceContractsData): ContractCatalog => ({
  panel: data.panel,
  daily: contractCadenceCatalogFromData("daily", data.daily),
  weekly: contractCadenceCatalogFromData("weekly", data.weekly),
});
