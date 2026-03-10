import type { Message } from "discord.js";
import type { RandomEventSelectionResult } from "../domain/content";

export type RandomEventsLiveRuntimeLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type ActiveRandomEventContext = {
  eventId: string;
  selection: RandomEventSelectionResult;
  message: Message;
};
