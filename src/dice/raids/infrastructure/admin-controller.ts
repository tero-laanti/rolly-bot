import type { RaidsConfig } from "../../../shared/config";
import type { RaidsAdminPort, RaidAdminStatus, TriggerRaidNowResult } from "../application/ports";
import type { RaidsLiveRuntime } from "./live-runtime";
import { getRaidsStateSnapshot, type RaidsState } from "./state-store";

type RegisteredRaidsAdminController = {
  config: RaidsConfig;
  state: RaidsState;
  runtime: RaidsLiveRuntime;
};

let registeredController: RegisteredRaidsAdminController | null = null;
let manualTriggerInFlight = false;

export const registerRaidsAdminController = (controller: RegisteredRaidsAdminController): void => {
  registeredController = controller;
};

export const clearRaidsAdminController = (): void => {
  registeredController = null;
  manualTriggerInFlight = false;
};

export const getRaidsAdminStatus = (): RaidAdminStatus | null => {
  if (!registeredController) {
    return null;
  }

  return {
    enabled: registeredController.config.enabled,
    channelId: registeredController.config.channelId,
    joinLeadMs: registeredController.config.joinLeadMs,
    activeDurationMs: registeredController.config.activeDurationMs,
    snapshot: getRaidsStateSnapshot(registeredController.state),
    activeRaids: registeredController.runtime.getActiveRaidsSnapshot(),
  };
};

export const triggerRaidNow = async (): Promise<TriggerRaidNowResult> => {
  if (!registeredController) {
    return { ok: false, reason: "unavailable" };
  }

  if (!registeredController.config.enabled) {
    return { ok: false, reason: "disabled" };
  }

  if (manualTriggerInFlight || registeredController.state.activeRaidsById.size > 0) {
    return { ok: false, reason: "active-raid-exists" };
  }

  manualTriggerInFlight = true;
  try {
    return {
      ok: true,
      result: await registeredController.runtime.triggerRaidNow(),
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    manualTriggerInFlight = false;
  }
};

export const raidsAdminPort: RaidsAdminPort = {
  getAdminStatus: getRaidsAdminStatus,
  triggerRaidNow,
};
