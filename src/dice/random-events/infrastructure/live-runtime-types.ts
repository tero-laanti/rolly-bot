import type { Message } from "discord.js";
import type { RandomEventEffect, RandomEventSelectionResult } from "../domain/content";
import type { RandomEventRollChallengeProgress } from "../domain/roll-challenges";

export type RandomEventsLiveRuntimeLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type ActiveRandomEventSequenceChallenge = {
  sessionId: number;
  userId: string;
  progress: RandomEventRollChallengeProgress;
  timer: ReturnType<typeof setTimeout>;
};

export type ActiveRandomEventSoloLadderState = {
  type: "solo-ladder";
  ownerUserId: string | null;
  stageIndex: number;
  resolvedLines: string[];
};

export type ActiveRandomEventPushYourLuckState = {
  type: "solo-push-your-luck";
  ownerUserId: string | null;
  stageIndex: number;
  resolvedLines: string[];
  potEffects: RandomEventEffect[];
};

export type ActiveRandomEventGroupMeterState = {
  type: "group-meter";
  stageIndex: number;
  stageProgress: number;
  resolvedLines: string[];
  participantUserIds: Set<string>;
  currentStageContributorUserIds: Set<string>;
  currentStageAttemptedUserIds: Set<string>;
};

export type ActiveRandomEventStakeOfferState = {
  type: "stake-offer";
  ownerUserId: string | null;
};

export type ActiveRandomEventFlowState =
  | {
      type: "single-resolution";
    }
  | ActiveRandomEventSoloLadderState
  | ActiveRandomEventPushYourLuckState
  | ActiveRandomEventGroupMeterState
  | ActiveRandomEventStakeOfferState;

export type ActiveRandomEventContext = {
  eventId: string;
  selection: RandomEventSelectionResult;
  message: Message;
  flowState: ActiveRandomEventFlowState;
  sequenceChallenge: ActiveRandomEventSequenceChallenge | null;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  baseDurationMs: number;
  currentPhaseExpiresAtMs: number;
  attemptedUserIds: Set<string>;
  failedAttemptLines: string[];
  failedAttemptUserIds: Set<string>;
};
