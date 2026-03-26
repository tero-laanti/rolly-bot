import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { renderRandomEventScenario, type RandomEventScenario } from "../domain/content";
import { buildInitialRandomEventPromptButtons } from "./live-runtime-trigger";

const moduleRequire = createRequire(__filename);

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

const createScenario = (flow: RandomEventScenario["flow"]): RandomEventScenario => ({
  id: "trigger-test",
  rarity: "rare",
  title: "Trigger Test",
  prompt: "A prompt appears.",
  claimLabel: "Do thing",
  claimPolicy: flow?.type === "group-meter" ? "multi-user" : "first-click",
  claimWindowSeconds: 60,
  flow,
  outcomes: flow
    ? []
    : [{ id: "success", resolution: "resolve-success", message: "Done.", effects: [] }],
});

test("group-meter events publish a join button immediately", () => {
  const selection = renderRandomEventScenario(
    createScenario({
      type: "group-meter",
      timeoutResolution: "resolve-current-stage",
      stages: [
        {
          id: "stage-one",
          label: "Stage One",
          requiredSuccesses: 2,
          successMessage: "The crowd lands the note.",
          successEffects: [{ type: "currency", minAmount: 4, maxAmount: 4 }],
        },
      ],
    }),
  );

  assert.deepEqual(buildInitialRandomEventPromptButtons({ eventId: "event-1", selection }), [
    {
      customId: "random-event:event-1:join",
      label: "Do thing",
    },
  ]);
});

test("non-group staged events fall back to the default claim button path", () => {
  const selection = renderRandomEventScenario(
    createScenario({
      type: "solo-ladder",
      timeoutResolution: "resolve-current-stage",
      stages: [
        {
          id: "stage-one",
          label: "Stage One",
          rollChallenge: {
            id: "stage-one-check",
            mode: "single-step",
            steps: [
              {
                id: "check",
                label: "Roll 4+",
                source: { type: "static-die", sides: 6 },
                target: 4,
                comparator: "gte",
              },
            ],
          },
          successMessage: "The ladder advances.",
          successEffects: [{ type: "currency", minAmount: 3, maxAmount: 3 }],
          failureMessage: "The ladder breaks.",
          failureEffects: [
            { type: "temporary-roll-penalty", divisor: 2, rolls: 3, stackMode: "refresh" },
          ],
        },
      ],
    }),
  );

  assert.equal(buildInitialRandomEventPromptButtons({ eventId: "event-1", selection }), undefined);
});

test("triggerRandomEventOpportunity skips publishing when claim windows are configured as non-positive", async () => {
  const modulePaths = [
    "../../../rolly-data/load",
    "./content-pack",
    "./live-runtime-trigger",
  ] as const;
  clearModules(modulePaths);

  const loadModule = moduleRequire(
    "../../../rolly-data/load",
  ) as typeof import("../../../rolly-data/load");
  const originalGetRandomEventBalanceData = loadModule.getRandomEventBalanceData;
  const originalGetRandomEventContentPackV1 = loadModule.getRandomEventContentPackV1;
  let sendCalled = false;

  try {
    (
      loadModule as {
        getRandomEventBalanceData: typeof loadModule.getRandomEventBalanceData;
      }
    ).getRandomEventBalanceData = () => ({
      claimWindowDurationMultiplier: 0,
      variety: {
        antiRepeatCooldownTriggers: 0,
        rarityChances: {
          common: 1,
          uncommon: 0,
          rare: 0,
          epic: 0,
          legendary: 0,
        },
        pity: {
          enabled: false,
          startAfterNonRareTriggers: 0,
          rareWeightStep: 0,
          epicWeightStep: 0,
          legendaryWeightStep: 0,
          maxBonusMultiplier: 1,
        },
      },
    });
    (
      loadModule as {
        getRandomEventContentPackV1: typeof loadModule.getRandomEventContentPackV1;
      }
    ).getRandomEventContentPackV1 = () => [createScenario(undefined)];

    const { triggerRandomEventOpportunity } = moduleRequire(
      "./live-runtime-trigger",
    ) as typeof import("./live-runtime-trigger");

    const result = await triggerRandomEventOpportunity({
      client: {
        channels: {
          fetch: async () => ({
            isTextBased: () => true,
            send: async () => {
              sendCalled = true;
              return null;
            },
          }),
        },
      } as never,
      config: {
        enabled: true,
        inactiveReason: null,
        channelId: "events-channel",
        targetEventsPerDay: 0,
        minGapMs: 1,
        maxActiveEvents: 1,
        retryDelayMs: 1,
        jitterRatio: 0,
        quietHours: {
          start: "00:00",
          end: "00:00",
          timezone: "UTC",
        },
      },
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      contentState: {
        triggerCount: 0,
        nonRareStreak: 0,
        lastSeenTriggerByTemplateId: new Map(),
      },
      activeEventsById: new Map(),
      windowManager: {
        openWindow: () => {
          throw new Error("openWindow should not be called for invalid claim windows.");
        },
        claim: () => {
          throw new Error("claim should not be called in this test.");
        },
        closeWindow: () => null,
        getWindow: () => null,
        listWindows: () => [],
        stop: () => undefined,
      },
      onResolved: async () => undefined,
    });

    assert.deepEqual(result, { created: false });
    assert.equal(sendCalled, false);
  } finally {
    (
      loadModule as {
        getRandomEventBalanceData: typeof loadModule.getRandomEventBalanceData;
      }
    ).getRandomEventBalanceData = originalGetRandomEventBalanceData;
    (
      loadModule as {
        getRandomEventContentPackV1: typeof loadModule.getRandomEventContentPackV1;
      }
    ).getRandomEventContentPackV1 = originalGetRandomEventContentPackV1;
    clearModules(modulePaths);
  }
});
