import assert from "node:assert/strict";
import test from "node:test";

import { createManageContractMasterUseCase } from "./use-case";
import type {
  ContractsCatalogReader,
  ContractsInitialOfferRepository,
  ContractsRerollUsageRepository,
  ContractsRunRepository,
  ContractsUserCadenceStateRepository,
} from "../ports";
import {
  createEmptyContractCadenceState,
  type ContractCadenceState,
  type ContractRun,
} from "../../domain/progress";
import type { ContractCatalog, ContractDifficulty } from "../../domain/types";

const createCatalog = (): ContractCatalog => ({
  panel: {
    title: "Contract Master",
    imageUrl: "https://example.com/contracts.png",
    description: "Pick a contract.",
    helperText: "Helper",
    dailyButtonLabel: "Daily Contracts",
    weeklyButtonLabel: "Weekly Contracts",
    askForContractButtonLabel: "Ask for a new contract",
  },
  daily: {
    label: "Daily",
    chooserTitle: "Daily Contracts",
    chooserDescription: "Choose wisely.",
    difficulties: {
      simple: {
        label: "Simple",
        rewardPips: 12,
        initialOffers: [
          {
            id: "daily-simple-a",
            title: "Daily Simple A",
            description: "A",
            cadence: "daily",
            difficulty: "simple",
            objective: { type: "roll_count", requiredCount: 5 },
            rewardPips: 12,
          },
          {
            id: "daily-simple-b",
            title: "Daily Simple B",
            description: "B",
            cadence: "daily",
            difficulty: "simple",
            objective: { type: "roll_count", requiredCount: 6 },
            rewardPips: 12,
          },
        ],
        refillOffers: [
          {
            id: "daily-simple-refill",
            title: "Daily Simple Refill",
            description: "Refill",
            cadence: "daily",
            difficulty: "simple",
            objective: { type: "roll_count", requiredCount: 7 },
            rewardPips: 12,
          },
        ],
      },
      serious: {
        label: "Serious",
        rewardPips: 20,
        initialOffers: [
          {
            id: "daily-serious-a",
            title: "Daily Serious A",
            description: "A",
            cadence: "daily",
            difficulty: "serious",
            objective: { type: "roll_count", requiredCount: 8 },
            rewardPips: 20,
          },
          {
            id: "daily-serious-b",
            title: "Daily Serious B",
            description: "B",
            cadence: "daily",
            difficulty: "serious",
            objective: { type: "roll_count", requiredCount: 9 },
            rewardPips: 20,
          },
        ],
        refillOffers: [
          {
            id: "daily-serious-refill",
            title: "Daily Serious Refill",
            description: "Refill",
            cadence: "daily",
            difficulty: "serious",
            objective: { type: "roll_count", requiredCount: 10 },
            rewardPips: 20,
          },
        ],
      },
      brutal: {
        label: "Brutal",
        rewardPips: 32,
        initialOffers: [
          {
            id: "daily-brutal-a",
            title: "Daily Brutal A",
            description: "A",
            cadence: "daily",
            difficulty: "brutal",
            objective: { type: "roll_count", requiredCount: 12 },
            rewardPips: 32,
          },
          {
            id: "daily-brutal-b",
            title: "Daily Brutal B",
            description: "B",
            cadence: "daily",
            difficulty: "brutal",
            objective: { type: "roll_count", requiredCount: 13 },
            rewardPips: 32,
          },
        ],
        refillOffers: [
          {
            id: "daily-brutal-refill",
            title: "Daily Brutal Refill",
            description: "Refill",
            cadence: "daily",
            difficulty: "brutal",
            objective: { type: "roll_count", requiredCount: 14 },
            rewardPips: 32,
          },
        ],
      },
    },
  },
  weekly: {
    label: "Weekly",
    chooserTitle: "Weekly Contracts",
    chooserDescription: "Choose wisely.",
    difficulties: {
      simple: {
        label: "Simple",
        rewardPips: 30,
        initialOffers: [],
        refillOffers: [],
      },
      serious: {
        label: "Serious",
        rewardPips: 45,
        initialOffers: [],
        refillOffers: [],
      },
      brutal: {
        label: "Brutal",
        rewardPips: 70,
        initialOffers: [],
        refillOffers: [],
      },
    },
  },
});

const createHarness = () => {
  const initialOffers = new Map<
    string,
    {
      cadence: "daily" | "weekly";
      difficulty: ContractDifficulty;
      resetWindow: string;
      contractId: string;
      createdAt: Date;
    }
  >();
  const states = new Map<string, ContractCadenceState>();
  const runs = new Map<string, ContractRun>();
  const rerolls = new Map<string, { difficulty: ContractDifficulty; usedAt: Date }>();

  const key = (...parts: string[]) => parts.join("|");

  const catalogReader: ContractsCatalogReader = {
    getCatalog: () => createCatalog(),
  };
  const initialOfferRepository: ContractsInitialOfferRepository = {
    getOffer: (cadence, difficulty, resetWindow) =>
      initialOffers.get(key(cadence, difficulty, resetWindow)) ?? null,
    listOffers: () => [],
    saveOffer: (record) => {
      initialOffers.set(key(record.cadence, record.difficulty, record.resetWindow), record);
    },
  };
  const userCadenceStateRepository: ContractsUserCadenceStateRepository = {
    getState: (userId, cadence, resetWindow) =>
      states.get(key(userId, cadence, resetWindow)) ?? null,
    saveState: (record) => {
      states.set(key(record.userId, record.cadence, record.resetWindow), record);
    },
  };
  const runRepository: ContractsRunRepository = {
    getRun: (userId, cadence, resetWindow, sequenceNumber) =>
      runs.get(key(userId, cadence, resetWindow, String(sequenceNumber))) ?? null,
    listRuns: (userId, cadence, resetWindow) =>
      [...runs.entries()]
        .filter(([entryKey]) => entryKey.startsWith(key(userId, cadence, resetWindow)))
        .map(([, value]) => value)
        .sort((left, right) => left.sequenceNumber - right.sequenceNumber),
    saveRun: (record) => {
      runs.set(
        key(record.userId, record.cadence, record.resetWindow, String(record.sequenceNumber)),
        record,
      );
    },
  };
  const rerollUsageRepository: ContractsRerollUsageRepository = {
    getUsage: (userId, cadence, resetWindow, difficulty) =>
      rerolls.get(key(userId, cadence, resetWindow, difficulty)) ?? null,
    listUsage: (userId, cadence, resetWindow) =>
      [...rerolls.entries()]
        .filter(([entryKey]) => entryKey.startsWith(key(userId, cadence, resetWindow)))
        .map(([, value]) => value),
    saveUsage: (record) => {
      rerolls.set(key(record.userId, record.cadence, record.resetWindow, record.difficulty), {
        difficulty: record.difficulty,
        usedAt: record.usedAt,
      });
    },
  };

  const unitOfWork = {
    runInTransaction: <T>(work: () => T): T => work(),
  };

  return {
    useCase: createManageContractMasterUseCase({
      catalogReader,
      initialOfferRepository,
      userCadenceStateRepository,
      runRepository,
      rerollUsageRepository,
      unitOfWork,
    }),
    states,
    runs,
    rerolls,
  };
};

test("reroll swaps the visible offer once and accept stores the rerolled contract", () => {
  const { useCase, runs } = createHarness();
  const now = new Date("2026-03-28T10:00:00.000Z");

  const rerolledView = useCase.rerollOffer({
    userId: "user-1",
    cadence: "daily",
    difficulty: "serious",
    now,
  });
  const seriousOffer = rerolledView.offers.find((offer) => offer.difficulty === "serious");
  assert(seriousOffer?.offer);
  assert.equal(seriousOffer.rerollUsed, true);

  const accepted = useCase.acceptOffer({
    userId: "user-1",
    cadence: "daily",
    difficulty: "serious",
    now,
  });

  assert.equal(accepted.acceptedRun.acceptedVia, "reroll");
  assert.equal(runs.size, 1);
});

test("refill only unlocks for the completed first-run difficulty", () => {
  const { useCase, runs, states } = createHarness();
  const now = new Date("2026-03-28T10:00:00.000Z");

  const firstAccepted = useCase.acceptOffer({
    userId: "user-1",
    cadence: "daily",
    difficulty: "simple",
    now,
  });
  runs.set("user-1|daily|2026-03-28|1", {
    ...firstAccepted.acceptedRun,
    currentCount: firstAccepted.acceptedRun.requiredCount,
    completedAt: new Date("2026-03-28T10:30:00.000Z"),
    rewardGrantedAt: new Date("2026-03-28T10:30:05.000Z"),
  });
  states.set("user-1|daily|2026-03-28", {
    ...createEmptyContractCadenceState("user-1", "daily", "2026-03-28"),
    completionCount: 1,
    refillAvailableDifficulty: "simple",
    lastCompletedAt: new Date("2026-03-28T10:30:00.000Z"),
  });

  assert.throws(
    () =>
      useCase.acceptOffer({
        userId: "user-1",
        cadence: "daily",
        difficulty: "serious",
        now: new Date("2026-03-28T11:00:00.000Z"),
      }),
    /No daily serious contract is currently available/,
  );

  const refillAccepted = useCase.acceptOffer({
    userId: "user-1",
    cadence: "daily",
    difficulty: "simple",
    now: new Date("2026-03-28T11:00:00.000Z"),
  });
  assert.equal(refillAccepted.acceptedRun.acceptedVia, "refill");
});

test("reroll budget is spent exactly once per difficulty", () => {
  const { useCase, rerolls } = createHarness();
  const now = new Date("2026-03-28T10:00:00.000Z");

  useCase.rerollOffer({
    userId: "user-1",
    cadence: "daily",
    difficulty: "brutal",
    now,
  });

  assert.throws(
    () =>
      useCase.rerollOffer({
        userId: "user-1",
        cadence: "daily",
        difficulty: "brutal",
        now: new Date("2026-03-28T10:05:00.000Z"),
      }),
    /already used your daily brutal reroll/,
  );
  assert.equal(rerolls.size, 1);
});
