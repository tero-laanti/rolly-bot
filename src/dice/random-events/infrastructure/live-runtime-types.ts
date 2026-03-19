import type { Message } from "discord.js";
import type { RandomEventSelectionResult } from "../domain/content";
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

export type ActiveRandomEventContext = {
  eventId: string;
  selection: RandomEventSelectionResult;
  message: Message;
  sequenceChallenge: ActiveRandomEventSequenceChallenge | null;
  liveExpiresAtMs: number;
  attemptedUserIds: Set<string>;
  failedAttemptLines: string[];
};
