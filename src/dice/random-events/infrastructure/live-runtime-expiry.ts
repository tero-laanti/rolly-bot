import type { ActiveRandomEventContext } from "./live-runtime-types";
import { updateActiveRandomEventExpiry, type RandomEventsState } from "./state-store";

export const getActiveRandomEventCurrentPhaseExpiryMs = (
  context: ActiveRandomEventContext,
): number => {
  return context.currentPhaseExpiresAtMs;
};

export const getActiveRandomEventCurrentPhaseExpiryDate = (
  context: ActiveRandomEventContext,
): Date => {
  return new Date(getActiveRandomEventCurrentPhaseExpiryMs(context));
};

export const setActiveRandomEventCurrentPhaseExpiryMs = (
  context: ActiveRandomEventContext,
  expiresAtMs: number,
): void => {
  context.currentPhaseExpiresAtMs = expiresAtMs;
};

export const syncActiveRandomEventCurrentPhaseExpiryMs = (
  state: RandomEventsState,
  context: ActiveRandomEventContext,
  expiresAtMs: number,
): void => {
  setActiveRandomEventCurrentPhaseExpiryMs(context, expiresAtMs);
  updateActiveRandomEventExpiry(state, context.eventId, new Date(expiresAtMs));
};

export const getActiveRandomEventRemainingCurrentPhaseDurationMs = (
  context: ActiveRandomEventContext,
  nowMs: number = Date.now(),
): number => {
  return Math.max(0, getActiveRandomEventCurrentPhaseExpiryMs(context) - nowMs);
};

export const getActiveRandomEventCappedCurrentPhaseExpiryMs = (
  context: ActiveRandomEventContext,
  nominalDurationMs: number,
  nowMs: number = Date.now(),
): number | null => {
  const currentPhaseExpiresAtMs = getActiveRandomEventCurrentPhaseExpiryMs(context);
  if (currentPhaseExpiresAtMs <= nowMs) {
    return null;
  }

  return Math.min(currentPhaseExpiresAtMs, nowMs + nominalDurationMs);
};
