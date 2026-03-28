import type { DiceContractObjectiveData } from "../types";

const formatCountSuffix = (requiredCount: number): string => `${requiredCount} time(s)`;

export const formatContractObjectiveText = (objective: DiceContractObjectiveData): string => {
  switch (objective.type) {
    case "roll_count":
      return `Roll ${formatCountSuffix(objective.requiredCount)}`;
    case "pvp_win_count":
      return `Win ${objective.requiredCount} PvP challenge(s)`;
    case "casino_game_count":
      return `Finish ${objective.requiredCount} casino game(s)`;
    case "world_boss_join_count":
      return `Join ${objective.requiredCount} World Boss encounter(s)`;
    default: {
      const exhaustiveCheck: never = objective.type;
      return exhaustiveCheck;
    }
  }
};
