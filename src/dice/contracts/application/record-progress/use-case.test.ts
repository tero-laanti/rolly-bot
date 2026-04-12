import assert from "node:assert/strict";
import test from "node:test";

import { createRecordContractsProgressUseCase } from "./use-case";
import type {
  ContractsCatalogReader,
  ContractsRunRepository,
  ContractsUserCadenceStateRepository,
} from "../ports";
import {
  createAcceptedRun,
  createEmptyContractCadenceState,
  type ContractOfferChoice,
  type ContractRun,
} from "../../domain/progress";

const makeChoice = (
  cadence: "daily" | "weekly",
  difficulty: "simple" | "serious" | "brutal",
  rewardPips: number,
  requiredCount: number,
): ContractOfferChoice => ({
  cadence,
  difficulty,
  source: "initial",
  rerollUsed: false,
  rerollAvailable: true,
  offer: {
    id: `${cadence}-${difficulty}-roll`,
    title: `${cadence} ${difficulty} roll`,
    description: "Roll a lot.",
    cadence,
    difficulty,
    objective: {
      type: "roll_count",
      requiredCount,
    },
    rewardPips,
  },
});

const createHarness = () => {
  const runs = new Map<string, ContractRun>();
  const states = new Map<string, ReturnType<typeof createEmptyContractCadenceState>>();
  let grantedPips = 0;

  const key = (...parts: string[]) => parts.join("|");

  const runRepository: ContractsRunRepository = {
    getRun: (userId, cadence, resetWindow, sequenceNumber) =>
      runs.get(key(userId, cadence, resetWindow, String(sequenceNumber))) ?? null,
    listRuns: (userId, cadence, resetWindow) =>
      [...runs.entries()]
        .filter(([entryKey]) => entryKey.startsWith(key(userId, cadence, resetWindow)))
        .map(([, record]) => record)
        .sort((left, right) => left.sequenceNumber - right.sequenceNumber),
    saveRun: (record) => {
      runs.set(
        key(record.userId, record.cadence, record.resetWindow, String(record.sequenceNumber)),
        record,
      );
    },
  };

  const userCadenceStateRepository: ContractsUserCadenceStateRepository = {
    getState: (userId, cadence, resetWindow) =>
      states.get(key(userId, cadence, resetWindow)) ?? null,
    saveState: (record) => {
      states.set(key(record.userId, record.cadence, record.resetWindow), record);
    },
  };

  const catalogReader: ContractsCatalogReader = {
    getCatalog: () => ({
      panel: {
        title: "Contract Master",
        imageUrl: "https://example.com/contracts.png",
        description: "desc",
        helperText: "helper",
        dailyButtonLabel: "Daily",
        weeklyButtonLabel: "Weekly",
        askForContractButtonLabel: "Ask",
      },
      daily: {
        label: "Daily",
        chooserTitle: "Daily Contracts",
        chooserDescription: "Pick daily",
        contractsPerWindow: 3,
        difficulties: {
          simple: { label: "Simple", rewardPips: 12, initialOffers: [], refillOffers: [] },
          serious: { label: "Serious", rewardPips: 20, initialOffers: [], refillOffers: [] },
          brutal: { label: "Brutal", rewardPips: 32, initialOffers: [], refillOffers: [] },
        },
      },
      weekly: {
        label: "Weekly",
        chooserTitle: "Weekly Contracts",
        chooserDescription: "Pick weekly",
        contractsPerWindow: 5,
        difficulties: {
          simple: { label: "Simple", rewardPips: 30, initialOffers: [], refillOffers: [] },
          serious: { label: "Serious", rewardPips: 45, initialOffers: [], refillOffers: [] },
          brutal: { label: "Brutal", rewardPips: 70, initialOffers: [], refillOffers: [] },
        },
      },
    }),
  };

  const useCase = createRecordContractsProgressUseCase({
    catalogReader,
    runRepository,
    userCadenceStateRepository,
    rewardGranter: {
      grantPips: (_userId, pips) => {
        grantedPips += pips;
      },
    },
    unitOfWork: {
      runInTransaction: <T>(work: () => T): T => work(),
    },
  });

  return { useCase, runs, states, getGrantedPips: () => grantedPips };
};

test("progress updates active accepted runs per cadence and grants pips once", () => {
  const { useCase, runs, states, getGrantedPips } = createHarness();
  const acceptedAt = new Date("2026-03-28T10:00:00.000Z");

  const dailyRun = createAcceptedRun(
    makeChoice("daily", "serious", 20, 2),
    "user-1",
    "2026-03-28",
    1,
    acceptedAt,
  );
  const weeklyRun = createAcceptedRun(
    makeChoice("weekly", "brutal", 70, 1),
    "user-1",
    "2026-03-23",
    1,
    acceptedAt,
  );
  runs.set("user-1|daily|2026-03-28|1", { ...dailyRun, currentCount: 1 });
  runs.set("user-1|weekly|2026-03-23|1", weeklyRun);

  const first = useCase.recordProgress({
    userId: "user-1",
    objectiveType: "roll_count",
    increment: 1,
    occurredAt: new Date("2026-03-28T10:30:00.000Z"),
  });

  assert(first);
  assert.equal(first.updates.length, 2);
  assert.deepEqual(first.contractCompletionAnnouncements, [
    {
      userId: "user-1",
      cadence: "daily",
      contractTitle: "daily serious roll",
      rewardPips: 20,
    },
    {
      userId: "user-1",
      cadence: "weekly",
      contractTitle: "weekly brutal roll",
      rewardPips: 70,
    },
  ]);
  assert.equal(getGrantedPips(), 90);
  assert.equal(states.get("user-1|daily|2026-03-28")?.completionCount, 1);
  assert.equal(states.get("user-1|daily|2026-03-28")?.refillAvailableDifficulty, "serious");
  assert.equal(states.get("user-1|weekly|2026-03-23")?.completionCount, 1);
  assert.equal(states.get("user-1|weekly|2026-03-23")?.refillAvailableDifficulty, "brutal");

  const second = useCase.recordProgress({
    userId: "user-1",
    objectiveType: "roll_count",
    increment: 1,
    occurredAt: new Date("2026-03-28T10:31:00.000Z"),
  });

  assert.equal(second, null);
  assert.equal(getGrantedPips(), 90);
});

test("non-matching objective families leave accepted runs untouched", () => {
  const { useCase, runs, states, getGrantedPips } = createHarness();
  runs.set(
    "user-1|daily|2026-03-28|1",
    createAcceptedRun(
      makeChoice("daily", "simple", 12, 3),
      "user-1",
      "2026-03-28",
      1,
      new Date("2026-03-28T10:00:00.000Z"),
    ),
  );

  const result = useCase.recordProgress({
    userId: "user-1",
    objectiveType: "pvp_win_count",
    increment: 1,
    occurredAt: new Date("2026-03-28T10:15:00.000Z"),
  });

  assert.equal(result, null);
  assert.equal(getGrantedPips(), 0);
  assert.equal(states.size, 0);
  assert.equal(runs.get("user-1|daily|2026-03-28|1")?.currentCount, 0);
});
