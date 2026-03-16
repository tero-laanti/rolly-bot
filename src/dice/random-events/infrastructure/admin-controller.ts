import { randomUUID } from "node:crypto";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import type { RandomEventClaimPolicy } from "../domain/claim-policy";
import type {
  RandomEventsAdminPort,
  RandomEventsAdminStatus,
  TriggerRandomEventNowResult,
} from "../application/ports";
import {
  evaluateRandomEventTrigger,
  type RandomEventsFoundationSchedulerController,
} from "./foundation-scheduler";
import type { RandomEventsLiveRuntime } from "./live-runtime";
import {
  getRandomEventsStateSnapshot,
  registerActiveRandomEvent,
  resolveActiveRandomEvent,
  setLastRandomEventTriggeredAt,
  sweepExpiredActiveRandomEvents,
  type RandomEventsState,
} from "./state-store";

type RegisteredRandomEventsAdminController = {
  config: RandomEventsFoundationConfig;
  state: RandomEventsState;
  runtime: RandomEventsLiveRuntime;
  scheduler: RandomEventsFoundationSchedulerController;
};

let registeredController: RegisteredRandomEventsAdminController | null = null;
let manualTriggerInFlight = false;

export const registerRandomEventsAdminController = (
  controller: RegisteredRandomEventsAdminController,
): void => {
  registeredController = controller;
};

export const clearRandomEventsAdminController = (): void => {
  registeredController = null;
  manualTriggerInFlight = false;
};

export const getRandomEventsAdminStatus = (): RandomEventsAdminStatus | null => {
  if (!registeredController) {
    return null;
  }

  const now = new Date();
  sweepExpiredActiveRandomEvents(registeredController.state, now);

  return {
    enabled: registeredController.config.enabled,
    channelId: registeredController.config.channelId,
    nextCheckAt: registeredController.scheduler.getNextCheckAt(),
    gate: evaluateRandomEventTrigger(registeredController.state, now, registeredController.config),
    snapshot: getRandomEventsStateSnapshot(registeredController.state),
    activeEvents: registeredController.runtime.getActiveEventsSnapshot(),
  };
};

const triggerRandomEventNowWithOptions = async (options?: {
  requiredClaimPolicy?: RandomEventClaimPolicy;
}): Promise<TriggerRandomEventNowResult> => {
  if (!registeredController) {
    return { ok: false, reason: "unavailable" };
  }

  if (!registeredController.config.enabled) {
    return { ok: false, reason: "disabled" };
  }

  if (manualTriggerInFlight) {
    return { ok: false, reason: "active-event-exists" };
  }

  const now = new Date();
  sweepExpiredActiveRandomEvents(registeredController.state, now);
  if (
    registeredController.state.activeEventsById.size >= registeredController.config.maxActiveEvents
  ) {
    return { ok: false, reason: "active-event-exists" };
  }

  const reservationEventId = `admin-trigger-lock:${randomUUID()}`;
  registerActiveRandomEvent(registeredController.state, {
    id: reservationEventId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30_000),
  });

  manualTriggerInFlight = true;
  try {
    const result = await registeredController.runtime.onTriggerOpportunity({
      now,
      requiredClaimPolicy: options?.requiredClaimPolicy,
    });
    resolveActiveRandomEvent(registeredController.state, reservationEventId);

    if (result?.created && result.eventId) {
      registerActiveRandomEvent(registeredController.state, {
        id: result.eventId,
        createdAt: now,
        expiresAt: result.expiresAt ?? null,
      });
      setLastRandomEventTriggeredAt(registeredController.state, now);
    }

    return { ok: true, result };
  } catch {
    resolveActiveRandomEvent(registeredController.state, reservationEventId);
    return { ok: false, reason: "unavailable" };
  } finally {
    manualTriggerInFlight = false;
  }
};

export const triggerRandomEventNow = async (): Promise<TriggerRandomEventNowResult> => {
  return triggerRandomEventNowWithOptions();
};

export const triggerRandomGroupEventNow = async (): Promise<TriggerRandomEventNowResult> => {
  return triggerRandomEventNowWithOptions({
    requiredClaimPolicy: "multi-user",
  });
};

export const randomEventsAdminPort: RandomEventsAdminPort = {
  getAdminStatus: getRandomEventsAdminStatus,
  triggerEventNow: triggerRandomEventNow,
  triggerGroupEventNow: triggerRandomGroupEventNow,
};
