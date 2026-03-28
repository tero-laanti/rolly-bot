import type { ContractCadence, ContractDifficulty } from "../../../domain/types";

export const contractMasterButtonPrefix = "contract-master:";

export type ContractMasterButtonAction =
  | {
      kind: "panel-open-cadence";
      cadence: ContractCadence;
    }
  | {
      kind: "view-open-cadence";
      cadence: ContractCadence;
    }
  | {
      kind: "open-chooser";
      cadence: ContractCadence;
    }
  | {
      kind: "accept-offer";
      cadence: ContractCadence;
      difficulty: ContractDifficulty;
    }
  | {
      kind: "reroll-offer";
      cadence: ContractCadence;
      difficulty: ContractDifficulty;
    };

const isCadence = (value: string): value is ContractCadence => {
  return value === "daily" || value === "weekly";
};

const isDifficulty = (value: string): value is ContractDifficulty => {
  return value === "simple" || value === "serious" || value === "brutal";
};

export const encodeContractMasterButtonAction = (action: ContractMasterButtonAction): string => {
  switch (action.kind) {
    case "panel-open-cadence":
      return `${contractMasterButtonPrefix}panel-open-cadence:${action.cadence}`;
    case "view-open-cadence":
      return `${contractMasterButtonPrefix}view-open-cadence:${action.cadence}`;
    case "open-chooser":
      return `${contractMasterButtonPrefix}open-chooser:${action.cadence}`;
    case "accept-offer":
      return `${contractMasterButtonPrefix}accept-offer:${action.cadence}:${action.difficulty}`;
    case "reroll-offer":
      return `${contractMasterButtonPrefix}reroll-offer:${action.cadence}:${action.difficulty}`;
  }
};

export const parseContractMasterButtonAction = (
  customId: string,
): ContractMasterButtonAction | null => {
  if (!customId.startsWith(contractMasterButtonPrefix)) {
    return null;
  }

  const payload = customId.slice(contractMasterButtonPrefix.length);
  const [kind, cadence, difficulty] = payload.split(":");

  if (
    (kind === "panel-open-cadence" || kind === "view-open-cadence" || kind === "open-chooser") &&
    cadence &&
    isCadence(cadence)
  ) {
    return { kind, cadence };
  }

  if (
    (kind === "accept-offer" || kind === "reroll-offer") &&
    cadence &&
    difficulty &&
    isCadence(cadence) &&
    isDifficulty(difficulty)
  ) {
    return {
      kind,
      cadence,
      difficulty,
    };
  }

  return null;
};
