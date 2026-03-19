import assert from "node:assert/strict";
import test from "node:test";
import {
  createRandomEventInteractionWindowManager,
  type RandomEventInteractionWindowLifecycleContext,
} from "./interaction-window";

test("multi-user window resolves immediately when maxParticipants is reached", () => {
  const resolvedContextRef: { value: RandomEventInteractionWindowLifecycleContext | null } = {
    value: null,
  };
  let nowMs = 1_000;
  const scheduledCallbackRef: { value: (() => void) | null } = { value: null };

  const manager = createRandomEventInteractionWindowManager({
    timingHooks: {
      nowMs: () => nowMs,
      setTimeoutFn: (callback) => {
        scheduledCallbackRef.value = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {
        scheduledCallbackRef.value = null;
      },
    },
  });

  manager.openWindow({
    windowId: "group-ready",
    durationMs: 60_000,
    policy: "multi-user",
    maxParticipants: 3,
    callbacks: {
      onResolved: (context) => {
        resolvedContextRef.value = context;
      },
    },
  });

  assert.equal(manager.claim("group-ready", "111").status, "accepted");
  assert.equal(manager.claim("group-ready", "222").status, "accepted");

  const result = manager.claim("group-ready", "333");
  assert.equal(result.status, "accepted");
  assert.equal(result.becameResolved, true);
  const resolvedContext = resolvedContextRef.value;
  assert.ok(resolvedContext);
  assert.equal(resolvedContext.reason, "claimed");
  assert.deepEqual(resolvedContext.snapshot.participants, ["111", "222", "333"]);
  assert.equal(manager.getWindow("group-ready"), null);
  assert.equal(scheduledCallbackRef.value, null);
});

test("multi-user window can expire below maxParticipants with the joined users preserved", () => {
  const resolvedContextRef: { value: RandomEventInteractionWindowLifecycleContext | null } = {
    value: null,
  };
  let nowMs = 5_000;
  const scheduledCallbackRef: { value: (() => void) | null } = { value: null };

  const manager = createRandomEventInteractionWindowManager({
    timingHooks: {
      nowMs: () => nowMs,
      setTimeoutFn: (callback) => {
        scheduledCallbackRef.value = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {
        scheduledCallbackRef.value = null;
      },
    },
  });

  manager.openWindow({
    windowId: "group-expire",
    durationMs: 60_000,
    policy: "multi-user",
    maxParticipants: 3,
    callbacks: {
      onResolved: (context) => {
        resolvedContextRef.value = context;
      },
    },
  });

  manager.claim("group-expire", "111");
  manager.claim("group-expire", "222");

  nowMs += 60_000;
  const scheduledCallback = scheduledCallbackRef.value;
  assert.ok(scheduledCallback);
  scheduledCallback();

  const resolvedContext = resolvedContextRef.value;
  assert.ok(resolvedContext);
  assert.equal(resolvedContext.reason, "expired");
  assert.deepEqual(resolvedContext.snapshot.participants, ["111", "222"]);
  assert.equal(manager.getWindow("group-expire"), null);
});
