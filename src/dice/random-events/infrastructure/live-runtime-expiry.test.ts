import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "discord.js";
import { renderRandomEventScenario, type RandomEventScenario } from "../domain/content";
import {
  getActiveRandomEventRemainingLiveDurationMs,
  syncActiveRandomEventLiveExpiryMs,
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
    liveExpiresAtMs: 2_000,
    attemptedUserIds: new Set<string>(),
    failedAttemptLines: [],
  };
};

test("syncActiveRandomEventLiveExpiryMs keeps context and state on the same live deadline", () => {
  const context = createContext();
  const state = createRandomEventsState();
  registerActiveRandomEvent(state, {
    id: context.eventId,
    createdAt: new Date(1_000),
    expiresAt: new Date(context.liveExpiresAtMs),
  });

  syncActiveRandomEventLiveExpiryMs(state, context, 9_000);

  assert.equal(context.liveExpiresAtMs, 9_000);
  assert.equal(state.activeEventsById.get(context.eventId)?.expiresAtMs, 9_000);
});

test("remaining live duration is based on the current live expiry", () => {
  const context = createContext();
  context.liveExpiresAtMs = 7_500;

  assert.equal(getActiveRandomEventRemainingLiveDurationMs(context, 7_000), 500);
  assert.equal(getActiveRandomEventRemainingLiveDurationMs(context, 8_000), 0);
});
