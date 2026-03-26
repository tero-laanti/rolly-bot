import assert from "node:assert/strict";
import test from "node:test";
import { renderRandomEventScenario, type RandomEventScenario } from "../domain/content";
import { buildInitialRandomEventPromptButtons } from "./live-runtime-trigger";

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
