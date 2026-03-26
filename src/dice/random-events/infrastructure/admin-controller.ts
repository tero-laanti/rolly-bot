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
let manualTriggerReservationToken: symbol | null = null;

export const registerRandomEventsAdminController = (
  controller: RegisteredRandomEventsAdminController,
): void => {
  registeredController = controller;
  manualTriggerReservationToken = null;
};

export const clearRandomEventsAdminController = (): void => {
  registeredController = null;
  manualTriggerReservationToken = null;
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
  const controller = registeredController;
  if (!controller) {
    return { ok: false, reason: "unavailable" };
  }

  if (!controller.config.enabled) {
    return { ok: false, reason: "disabled" };
  }

  if (manualTriggerReservationToken) {
    return { ok: false, reason: "active-event-exists" };
  }

  const now = new Date();
  sweepExpiredActiveRandomEvents(controller.state, now);
  if (controller.state.activeEventsById.size >= controller.config.maxActiveEvents) {
    return { ok: false, reason: "active-event-exists" };
  }

  const reservationEventId = `admin-trigger-lock:${randomUUID()}`;
  registerActiveRandomEvent(controller.state, {
    id: reservationEventId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30_000),
  });

  const reservationToken = Symbol("manual-random-event-trigger");
  manualTriggerReservationToken = reservationToken;
  try {
    const result = await controller.runtime.onTriggerOpportunity({
      now,
      requiredClaimPolicy: options?.requiredClaimPolicy,
    });
    resolveActiveRandomEvent(controller.state, reservationEventId);

    if (result?.created && result.eventId) {
      registerActiveRandomEvent(controller.state, {
        id: result.eventId,
        createdAt: now,
        expiresAt: result.expiresAt ?? null,
      });
      setLastRandomEventTriggeredAt(controller.state, now);
    }

    return { ok: true, result };
  } catch {
    resolveActiveRandomEvent(controller.state, reservationEventId);
    return { ok: false, reason: "unavailable" };
  } finally {
    if (manualTriggerReservationToken === reservationToken) {
      manualTriggerReservationToken = null;
    }
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
