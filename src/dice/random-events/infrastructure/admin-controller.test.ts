import assert from "node:assert/strict";
import test from "node:test";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import {
  clearRandomEventsAdminController,
  registerRandomEventsAdminController,
  triggerRandomEventNow,
} from "./admin-controller";
import { createRandomEventsState } from "./state-store";

const baseConfig: RandomEventsFoundationConfig = {
  enabled: true,
  inactiveReason: null,
  channelId: "events-channel",
  targetEventsPerDay: 0,
  minGapMs: 1,
  maxActiveEvents: 2,
  retryDelayMs: 1,
  jitterRatio: 0,
  quietHours: {
    start: "00:00",
    end: "00:00",
    timezone: "UTC",
  },
};

const createScheduler = () => ({
  stop: () => undefined,
  getNextCheckAt: () => null,
});

const createDeferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolved) => {
    resolve = resolved;
  });

  return {
    promise,
    resolve,
  };
};

test.afterEach(() => {
  clearRandomEventsAdminController();
});

test("manual trigger keeps cleanup and registration on the original controller state", async () => {
  const stateA = createRandomEventsState();
  const stateB = createRandomEventsState();
  const trigger = createDeferred<{ created: true; eventId: string }>();

  registerRandomEventsAdminController({
    config: baseConfig,
    state: stateA,
    runtime: {
      onTriggerOpportunity: () => trigger.promise,
      handleButtonInteraction: async () => undefined,
      getActiveEventsSnapshot: () => [],
      stop: () => undefined,
    },
    scheduler: createScheduler(),
  });

  const triggerPromise = triggerRandomEventNow();
  assert.equal(stateA.activeEventsById.size, 1);

  clearRandomEventsAdminController();
  registerRandomEventsAdminController({
    config: baseConfig,
    state: stateB,
    runtime: {
      onTriggerOpportunity: async () => ({ created: false }),
      handleButtonInteraction: async () => undefined,
      getActiveEventsSnapshot: () => [],
      stop: () => undefined,
    },
    scheduler: createScheduler(),
  });

  trigger.resolve({ created: true, eventId: "event-a" });
  const result = await triggerPromise;

  assert.deepEqual(result, {
    ok: true,
    result: { created: true, eventId: "event-a" },
  });
  assert.equal(stateA.activeEventsById.has("event-a"), true);
  assert.equal(stateA.lastTriggeredAtMs !== null, true);
  assert.equal(stateB.activeEventsById.size, 0);
  assert.equal(stateB.lastTriggeredAtMs, null);
});

test("an older in-flight trigger cannot clear the newer controller reservation token", async () => {
  const stateA = createRandomEventsState();
  const stateB = createRandomEventsState();
  const triggerA = createDeferred<{ created: false }>();
  const triggerB = createDeferred<{ created: false }>();

  registerRandomEventsAdminController({
    config: baseConfig,
    state: stateA,
    runtime: {
      onTriggerOpportunity: () => triggerA.promise,
      handleButtonInteraction: async () => undefined,
      getActiveEventsSnapshot: () => [],
      stop: () => undefined,
    },
    scheduler: createScheduler(),
  });

  const firstTrigger = triggerRandomEventNow();
  clearRandomEventsAdminController();

  registerRandomEventsAdminController({
    config: baseConfig,
    state: stateB,
    runtime: {
      onTriggerOpportunity: () => triggerB.promise,
      handleButtonInteraction: async () => undefined,
      getActiveEventsSnapshot: () => [],
      stop: () => undefined,
    },
    scheduler: createScheduler(),
  });

  const secondTrigger = triggerRandomEventNow();
  triggerA.resolve({ created: false });
  await firstTrigger;

  const thirdTrigger = await triggerRandomEventNow();
  assert.deepEqual(thirdTrigger, {
    ok: false,
    reason: "active-event-exists",
  });

  triggerB.resolve({ created: false });
  const secondResult = await secondTrigger;
  assert.deepEqual(secondResult, {
    ok: true,
    result: { created: false },
  });
});
