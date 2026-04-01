import type { WorldBossConfig } from "../../../shared/config";
import type {
  WorldBossAdminStatus,
  WorldBossDoubleRollRushLookupPort,
  WorldBossDiceRollPort,
  WorldBossAdminPort,
  TriggerWorldBossNowResult,
} from "../application/ports";
import type { WorldBossLiveRuntime } from "./live-runtime";
import {
  getLastWorldBossTriggeredAt,
  setLastWorldBossTriggeredAt,
  type WorldBossState,
} from "./state-store";

type WorldBossFoundationSchedulerLike = {
  getNextCheckAt: () => Date | null;
};

type RegisteredWorldBossAdminController = {
  config: WorldBossConfig;
  runtime: WorldBossLiveRuntime | null;
  state: WorldBossState | null;
  scheduler: WorldBossFoundationSchedulerLike | null;
};

let registeredController: RegisteredWorldBossAdminController | null = null;
let manualTriggerInFlight = false;

export const registerWorldBossAdminController = (
  controller: RegisteredWorldBossAdminController,
): void => {
  registeredController = controller;
};

export const clearWorldBossAdminController = (): void => {
  registeredController = null;
  manualTriggerInFlight = false;
};

export const getWorldBossAdminStatus = (): WorldBossAdminStatus | null => {
  if (!registeredController) {
    return null;
  }

  const liveWorldBosses = registeredController.runtime?.getLiveWorldBossesSnapshot() ?? [];

  return {
    enabled: registeredController.config.enabled,
    channelId: registeredController.config.channelId,
    joinLeadMs: registeredController.config.joinLeadMs,
    activeDurationMs: registeredController.config.activeDurationMs,
    targetWorldBossesPerDay: registeredController.config.targetWorldBossesPerDay,
    minGapMs: registeredController.config.minGapMs,
    retryDelayMs: registeredController.config.retryDelayMs,
    quietHours: registeredController.config.quietHours,
    snapshot: {
      liveWorldBossCount: liveWorldBosses.length,
      lastTriggeredAt: registeredController.state
        ? getLastWorldBossTriggeredAt(registeredController.state)
        : null,
      nextCheckAt: registeredController.scheduler?.getNextCheckAt() ?? null,
    },
    liveWorldBosses,
  };
};

export const triggerWorldBossNow = async (): Promise<TriggerWorldBossNowResult> => {
  if (!registeredController) {
    return { ok: false, reason: "unavailable" };
  }

  if (!registeredController.config.enabled) {
    return { ok: false, reason: "disabled" };
  }

  if (!registeredController.runtime) {
    return { ok: false, reason: "unavailable" };
  }

  if (manualTriggerInFlight || registeredController.runtime.hasBlockingWorldBoss()) {
    return { ok: false, reason: "active-world-boss-exists" };
  }

  manualTriggerInFlight = true;
  try {
    const result = await registeredController.runtime.triggerWorldBossNow();
    if (result.created && registeredController.state) {
      setLastWorldBossTriggeredAt(registeredController.state, new Date());
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

const applyDiceRoll = (input: Parameters<WorldBossLiveRuntime["applyDiceRoll"]>[0]) => {
  if (!registeredController?.runtime) {
    return {
      kind: "no-world-boss",
    } as const;
  }

  return registeredController.runtime.applyDiceRoll(input);
};

const getActiveDoubleRollRushStatus = (
  input: Parameters<WorldBossLiveRuntime["getActiveDoubleRollRushStatus"]>[0],
) => {
  if (!registeredController?.runtime) {
    return {
      isActive: false,
      expiresAtMs: null,
    } as const;
  }

  return registeredController.runtime.getActiveDoubleRollRushStatus(input);
};

export const worldBossAdminPort: WorldBossAdminPort = {
  getAdminStatus: getWorldBossAdminStatus,
  triggerWorldBossNow,
};

export const worldBossDiceRollPort: WorldBossDiceRollPort = {
  applyDiceRoll,
};

export const worldBossDoubleRollRushLookupPort: WorldBossDoubleRollRushLookupPort = {
  getActiveDoubleRollRushStatus,
};
