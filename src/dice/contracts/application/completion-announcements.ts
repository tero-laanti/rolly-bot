import type { ContractCadence } from "../domain/types";

export type ContractCompletionAnnouncement = {
  userId: string;
  cadence: ContractCadence;
  contractTitle: string;
  rewardPips: number;
};

export const createContractCompletionAnnouncement = ({
  userId,
  cadence,
  contractTitle,
  rewardPips,
}: ContractCompletionAnnouncement): ContractCompletionAnnouncement | null => {
  if (userId.length < 1 || contractTitle.length < 1) {
    return null;
  }

  return {
    userId,
    cadence,
    contractTitle,
    rewardPips,
  };
};
