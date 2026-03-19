import type { ActiveRandomEventContext } from "./live-runtime-types";
import { updateActiveRandomEventExpiry, type RandomEventsState } from "./state-store";

export const getActiveRandomEventLiveExpiryMs = (context: ActiveRandomEventContext): number => {
  return context.liveExpiresAtMs;
};

export const getActiveRandomEventLiveExpiryDate = (context: ActiveRandomEventContext): Date => {
  return new Date(getActiveRandomEventLiveExpiryMs(context));
};

export const setActiveRandomEventLiveExpiryMs = (
  context: ActiveRandomEventContext,
  expiresAtMs: number,
): void => {
  context.liveExpiresAtMs = expiresAtMs;
};

export const syncActiveRandomEventLiveExpiryMs = (
  state: RandomEventsState,
  context: ActiveRandomEventContext,
  expiresAtMs: number,
): void => {
  setActiveRandomEventLiveExpiryMs(context, expiresAtMs);
  updateActiveRandomEventExpiry(state, context.eventId, new Date(expiresAtMs));
};

export const getActiveRandomEventRemainingLiveDurationMs = (
  context: ActiveRandomEventContext,
  nowMs: number = Date.now(),
): number => {
  return Math.max(0, getActiveRandomEventLiveExpiryMs(context) - nowMs);
};
