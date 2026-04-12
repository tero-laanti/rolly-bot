import assert from "node:assert/strict";
import test from "node:test";

import { createQueryContractsUseCase } from "./use-case";
import type { ContractCadenceView } from "../ports";

const createCadenceView = (
  cadence: "daily" | "weekly",
  overrides: Partial<ContractCadenceView> = {},
): ContractCadenceView => ({
  cadence,
  label: cadence === "daily" ? "Daily" : "Weekly",
  chooserTitle: cadence === "daily" ? "Daily Contracts" : "Weekly Contracts",
  chooserDescription: "Pick a contract.",
  contractsPerWindow: cadence === "daily" ? 3 : 5,
  resetWindow: cadence === "daily" ? "2026-03-28" : "2026-03-23",
  resetAt:
    cadence === "daily"
      ? new Date("2026-03-29T00:00:00.000Z")
      : new Date("2026-03-30T00:00:00.000Z"),
  activeRun: null,
  completionCount: 0,
  refillAvailableDifficulty: undefined,
  refillClaimed: false,
  offers: [
    {
      difficulty: "simple",
      label: "Simple",
      rewardPips: 12,
      offer: null,
      source: null,
      rerollUsed: false,
      rerollAvailable: true,
      selectable: true,
    },
    {
      difficulty: "serious",
      label: "Serious",
      rewardPips: 20,
      offer: null,
      source: null,
      rerollUsed: false,
      rerollAvailable: true,
      selectable: true,
    },
    {
      difficulty: "brutal",
      label: "Brutal",
      rewardPips: 32,
      offer: null,
      source: null,
      rerollUsed: false,
      rerollAvailable: true,
      selectable: true,
    },
  ],
  ...overrides,
});

test("contracts reply shows active accepted runs and summary state", () => {
  const useCase = createQueryContractsUseCase({
    cadenceResolver: {
      resolveCadenceView: ({ cadence }) =>
        cadence === "daily"
          ? createCadenceView("daily", {
              activeRun: {
                userId: "user-1",
                cadence: "daily",
                resetWindow: "2026-03-28",
                sequenceNumber: 1,
                contractId: "daily-serious-roll",
                contractTitle: "Serious Roller",
                contractDescription: "Use /roll 10 times.",
                difficulty: "serious",
                objectiveType: "roll_count",
                requiredCount: 10,
                currentCount: 4,
                acceptedVia: "initial",
                acceptedAt: new Date("2026-03-28T10:00:00.000Z"),
                rewardPips: 20,
              },
            })
          : createCadenceView("weekly", {
              completionCount: 1,
              refillAvailableDifficulty: "brutal",
            }),
      resolveActiveRotation: () => {
        throw new Error("not used");
      },
    },
  });

  const result = useCase.createContractsReply({
    userId: "user-1",
    userMention: "<@user-1>",
    now: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.equal(result.ephemeral, false);
  assert.match(result.content, /\*\*Daily Contracts\*\*/);
  assert.match(result.content, /Serious Roller/);
  assert.match(result.content, /Difficulty: serious/);
  assert.match(result.content, /Progress: 4\/10/);
  assert.match(result.content, /Reward: 20 Pips/);
  assert.match(result.content, /Status: In progress/);
  assert.match(result.content, /Rerolls: Simple: ready \| Serious: ready \| Brutal: ready/);
  assert.match(result.content, /Refill: Finish your active serious contract first\./);
  assert.match(result.content, /Completed this window: 1\/5/);
  assert.match(result.content, /Refill: Available for brutal difficulty \(4 contracts left\)\./);
});

test("contracts reply shows unavailable state when contracts are disabled", () => {
  const useCase = createQueryContractsUseCase({
    cadenceResolver: null,
  });

  const result = useCase.createContractsReply({
    userId: "user-1",
    userMention: "<@user-1>",
    now: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.match(result.content, /Contracts are currently unavailable/);
  assert.match(result.content, /contracts\.v2\.json/);
});

test("contracts reply trims oversized content to Discord limits", () => {
  const longDescription = "Very long description. ".repeat(120).trim();
  const useCase = createQueryContractsUseCase({
    cadenceResolver: {
      resolveCadenceView: ({ cadence }) =>
        createCadenceView(cadence, {
          activeRun: {
            userId: "user-1",
            cadence,
            resetWindow: cadence === "daily" ? "2026-03-28" : "2026-03-23",
            sequenceNumber: 1,
            contractId: `${cadence}-active`,
            contractTitle: `${cadence} title`,
            contractDescription: longDescription,
            difficulty: "brutal",
            objectiveType: "roll_count",
            requiredCount: 200,
            currentCount: 150,
            acceptedVia: "initial",
            acceptedAt: new Date("2026-03-28T10:00:00.000Z"),
            rewardPips: 70,
          },
        }),
      resolveActiveRotation: () => {
        throw new Error("not used");
      },
    },
  });

  const result = useCase.createContractsReply({
    userId: "user-1",
    userMention: "<@user-1>",
    now: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.ok(result.content.length <= 2_000);
});
