import assert from "node:assert/strict";
import test from "node:test";
import type { RandomEventsFoundationConfig } from "../../../shared/config";
import { minutesToMs, secondsToMs } from "../../../shared/time";
import { getRandomCadenceDelayMs } from "./foundation-scheduler";

const createConfig = (
  overrides: Partial<RandomEventsFoundationConfig> = {},
): RandomEventsFoundationConfig => ({
  enabled: true,
  inactiveReason: null,
  channelId: "events-channel",
  targetEventsPerDay: 23,
  minGapMs: minutesToMs(30),
  maxActiveEvents: 1,
  retryDelayMs: secondsToMs(300),
  jitterRatio: 0,
  quietHours: {
    start: "23:00",
    end: "08:00",
    timezone: "Europe/Helsinki",
  },
  ...overrides,
});

test("random event cadence is paced across active hours instead of the full 24-hour day", () => {
  const withQuietHours = getRandomCadenceDelayMs(createConfig(), () => 0.5);
  const withoutQuietHours = getRandomCadenceDelayMs(
    createConfig({
      quietHours: {
        start: "00:00",
        end: "00:00",
        timezone: "UTC",
      },
    }),
    () => 0.5,
  );

  assert.equal(withQuietHours, Math.round((15 * 60 * 60 * 1000) / 23));
  assert.equal(withoutQuietHours, Math.round((24 * 60 * 60 * 1000) / 23));
  assert.ok(withQuietHours < withoutQuietHours);
});

test("random event cadence still respects the configured minimum gap", () => {
  const delayMs = getRandomCadenceDelayMs(
    createConfig({
      targetEventsPerDay: 200,
      minGapMs: minutesToMs(30),
      quietHours: {
        start: "00:00",
        end: "00:00",
        timezone: "UTC",
      },
    }),
    () => 0.5,
  );

  assert.equal(delayMs, minutesToMs(30));
});
