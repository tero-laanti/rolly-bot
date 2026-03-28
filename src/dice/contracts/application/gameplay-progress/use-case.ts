import type {
  ContractsGameplayProgressPort,
  ContractsProgressRecorder,
  ContractsProgressResult,
} from "../ports";
import type { ContractObjectiveType } from "../../domain/types";

type Dependencies = {
  progressRecorder: ContractsProgressRecorder;
};

const createObjectiveRecorder = (
  progressRecorder: ContractsProgressRecorder,
  objectiveType: ContractObjectiveType,
) => {
  return ({
    userId,
    occurredAt,
  }: {
    userId: string;
    occurredAt: Date;
  }): ContractsProgressResult | null =>
    progressRecorder.recordProgress({
      userId,
      objectiveType,
      increment: 1,
      occurredAt,
    });
};

export const createContractsGameplayProgressPort = ({
  progressRecorder,
}: Dependencies): ContractsGameplayProgressPort => {
  return {
    recordRoll: createObjectiveRecorder(progressRecorder, "roll_count"),
    recordPvpWin: createObjectiveRecorder(progressRecorder, "pvp_win_count"),
    recordCasinoGameCompletion: createObjectiveRecorder(progressRecorder, "casino_game_count"),
    recordWorldBossJoin: createObjectiveRecorder(progressRecorder, "world_boss_join_count"),
  };
};
