import type { RaidsConfig } from "../../../shared/config";
import type {
  RaidAdminStatus,
  RaidDiceRollPort,
  RaidsAdminPort,
  TriggerRaidNowResult,
} from "../application/ports";
import type { RaidsLiveRuntime } from "./live-runtime";
import { getLastRaidTriggeredAt, setLastRaidTriggeredAt, type RaidsState } from "./state-store";

type RaidsFoundationSchedulerLike = {
  getNextCheckAt: () => Date | null;
};

type RegisteredRaidsAdminController = {
  config: RaidsConfig;
  runtime: RaidsLiveRuntime | null;
  state: RaidsState | null;
  scheduler: RaidsFoundationSchedulerLike | null;
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

  const liveRaids = registeredController.runtime?.getLiveRaidsSnapshot() ?? [];

  return {
    enabled: registeredController.config.enabled,
    channelId: registeredController.config.channelId,
    joinLeadMs: registeredController.config.joinLeadMs,
    activeDurationMs: registeredController.config.activeDurationMs,
    targetRaidsPerDay: registeredController.config.targetRaidsPerDay,
    minGapMs: registeredController.config.minGapMs,
    retryDelayMs: registeredController.config.retryDelayMs,
    quietHours: registeredController.config.quietHours,
    snapshot: {
      liveRaidCount: liveRaids.length,
      lastTriggeredAt: registeredController.state
        ? getLastRaidTriggeredAt(registeredController.state)
        : null,
      nextCheckAt: registeredController.scheduler?.getNextCheckAt() ?? null,
    },
    liveRaids,
  };
};

export const triggerRaidNow = async (): Promise<TriggerRaidNowResult> => {
  if (!registeredController) {
    return { ok: false, reason: "unavailable" };
  }

  if (!registeredController.config.enabled) {
    return { ok: false, reason: "disabled" };
  }

  if (!registeredController.runtime) {
    return { ok: false, reason: "unavailable" };
  }

  if (manualTriggerInFlight || registeredController.runtime.hasBlockingRaid()) {
    return { ok: false, reason: "active-raid-exists" };
  }

  manualTriggerInFlight = true;
  try {
    const result = await registeredController.runtime.triggerRaidNow();
    if (result.created && registeredController.state) {
      setLastRaidTriggeredAt(registeredController.state, new Date());
    }

    return {
      ok: true,
      result,
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    manualTriggerInFlight = false;
  }
};

const applyDiceRoll = (input: Parameters<RaidsLiveRuntime["applyDiceRoll"]>[0]) => {
  if (!registeredController?.runtime) {
    return {
      kind: "no-raid",
    } as const;
  }

  return registeredController.runtime.applyDiceRoll(input);
};

export const raidsAdminPort: RaidsAdminPort = {
  getAdminStatus: getRaidsAdminStatus,
  triggerRaidNow,
};

export const raidsDiceRollPort: RaidDiceRollPort = {
  applyDiceRoll,
};
