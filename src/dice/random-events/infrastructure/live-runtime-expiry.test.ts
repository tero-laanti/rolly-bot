import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "discord.js";
import { renderRandomEventScenario, type RandomEventScenario } from "../domain/content";
import {
  getActiveRandomEventCappedCurrentPhaseExpiryMs,
  getActiveRandomEventRemainingCurrentPhaseDurationMs,
  syncActiveRandomEventCurrentPhaseExpiryMs,
} from "./live-runtime-expiry";
import type { ActiveRandomEventContext } from "./live-runtime-types";
import { createRandomEventsState, registerActiveRandomEvent } from "./state-store";

const createScenario = (): RandomEventScenario => {
  return {
    id: "expiry-test",
    rarity: "common",
    title: "Expiry Test",
    prompt: "Claim it.",
    claimLabel: "Claim",
    claimPolicy: "first-click",
    claimWindowSeconds: 30,
    outcomes: [
      {
        id: "success",
        resolution: "resolve-success",
        message: "You got it.",
        effects: [],
      },
    ],
  };
};

const createContext = (): ActiveRandomEventContext => {
  return {
    eventId: "event-1",
    selection: renderRandomEventScenario(createScenario(), { random: () => 0 }),
    message: {
      id: "message-1",
      channelId: "channel-1",
    } as unknown as Message,
    sequenceChallenge: null,
    currentPhaseExpiresAtMs: 2_000,
    attemptedUserIds: new Set<string>(),
    failedAttemptLines: [],
  };
};

test("syncActiveRandomEventCurrentPhaseExpiryMs keeps context and state on the same deadline", () => {
  const context = createContext();
  const state = createRandomEventsState();
  registerActiveRandomEvent(state, {
    id: context.eventId,
    createdAt: new Date(1_000),
    expiresAt: new Date(context.currentPhaseExpiresAtMs),
  });

  syncActiveRandomEventCurrentPhaseExpiryMs(state, context, 9_000);

  assert.equal(context.currentPhaseExpiresAtMs, 9_000);
  assert.equal(state.activeEventsById.get(context.eventId)?.expiresAtMs, 9_000);
});

test("remaining current phase duration is based on the authoritative phase expiry", () => {
  const context = createContext();
  context.currentPhaseExpiresAtMs = 7_500;

  assert.equal(getActiveRandomEventRemainingCurrentPhaseDurationMs(context, 7_000), 500);
  assert.equal(getActiveRandomEventRemainingCurrentPhaseDurationMs(context, 8_000), 0);
});

test("capped current phase expiry never extends an existing event deadline", () => {
  const context = createContext();
  context.currentPhaseExpiresAtMs = 12_000;

  assert.equal(getActiveRandomEventCappedCurrentPhaseExpiryMs(context, 20_000, 10_000), 12_000);
});

test("capped current phase expiry uses the nominal duration when it fits inside the event budget", () => {
  const context = createContext();
  context.currentPhaseExpiresAtMs = 40_000;

  assert.equal(getActiveRandomEventCappedCurrentPhaseExpiryMs(context, 5_000, 10_000), 15_000);
});

test("capped current phase expiry returns null when the event budget is already exhausted", () => {
  const context = createContext();
  context.currentPhaseExpiresAtMs = 10_000;

  assert.equal(getActiveRandomEventCappedCurrentPhaseExpiryMs(context, 5_000, 10_000), null);
});
