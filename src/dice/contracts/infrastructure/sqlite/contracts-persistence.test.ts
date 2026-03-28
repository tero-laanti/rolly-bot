import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import {
  createSqliteContractMasterInitialOfferRepository,
  createSqliteContractMasterRerollUsageRepository,
  createSqliteContractMasterRunRepository,
  createSqliteContractMasterUserCadenceStateRepository,
} from "./contracts-repository";

const createRepositories = (db: Database.Database) => ({
  initialOfferRepository: createSqliteContractMasterInitialOfferRepository(db),
  cadenceStateRepository: createSqliteContractMasterUserCadenceStateRepository(db),
  runRepository: createSqliteContractMasterRunRepository(db),
  rerollUsageRepository: createSqliteContractMasterRerollUsageRepository(db),
});

test("contract master initial offers are persisted per cadence difficulty and reset window", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const { initialOfferRepository } = createRepositories(db);

  initialOfferRepository.saveOffer({
    cadence: "daily",
    difficulty: "simple",
    resetWindow: "2026-03-28",
    contractId: "daily-simple-a",
    createdAt: new Date("2026-03-28T10:00:00.000Z"),
  });
  initialOfferRepository.saveOffer({
    cadence: "daily",
    difficulty: "serious",
    resetWindow: "2026-03-28",
    contractId: "daily-serious-a",
    createdAt: new Date("2026-03-28T10:01:00.000Z"),
  });
  initialOfferRepository.saveOffer({
    cadence: "daily",
    difficulty: "brutal",
    resetWindow: "2026-03-28",
    contractId: "daily-brutal-a",
    createdAt: new Date("2026-03-28T10:02:00.000Z"),
  });
  initialOfferRepository.saveOffer({
    cadence: "daily",
    difficulty: "simple",
    resetWindow: "2026-03-29",
    contractId: "daily-simple-next-window",
    createdAt: new Date("2026-03-29T10:00:00.000Z"),
  });

  assert.equal(
    initialOfferRepository.getOffer("daily", "serious", "2026-03-28")?.contractId,
    "daily-serious-a",
  );
  assert.deepEqual(
    initialOfferRepository
      .listOffers("daily", "2026-03-28")
      .map((record) => `${record.difficulty}:${record.contractId}`),
    ["simple:daily-simple-a", "serious:daily-serious-a", "brutal:daily-brutal-a"],
  );
  assert.equal(
    initialOfferRepository.getOffer("daily", "simple", "2026-03-29")?.contractId,
    "daily-simple-next-window",
  );
});

test("contract master cadence state upserts completion and refill eligibility per reset window", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const { cadenceStateRepository } = createRepositories(db);

  cadenceStateRepository.saveState({
    userId: "user-1",
    cadence: "weekly",
    resetWindow: "2026-W13",
    completionCount: 0,
  });
  cadenceStateRepository.saveState({
    userId: "user-1",
    cadence: "weekly",
    resetWindow: "2026-W13",
    completionCount: 1,
    refillAvailableDifficulty: "brutal",
    lastCompletedAt: new Date("2026-03-28T11:00:00.000Z"),
  });
  cadenceStateRepository.saveState({
    userId: "user-1",
    cadence: "weekly",
    resetWindow: "2026-W14",
    completionCount: 0,
  });

  assert.deepEqual(cadenceStateRepository.getState("user-1", "weekly", "2026-W13"), {
    userId: "user-1",
    cadence: "weekly",
    resetWindow: "2026-W13",
    completionCount: 1,
    refillAvailableDifficulty: "brutal",
    refillClaimedAt: undefined,
    lastCompletedAt: new Date("2026-03-28T11:00:00.000Z"),
  });
  assert.deepEqual(cadenceStateRepository.getState("user-1", "weekly", "2026-W14"), {
    userId: "user-1",
    cadence: "weekly",
    resetWindow: "2026-W14",
    completionCount: 0,
    refillAvailableDifficulty: undefined,
    refillClaimedAt: undefined,
    lastCompletedAt: undefined,
  });
});

test("contract master runs persist accepted metadata progress completion and reward idempotency markers", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const { runRepository } = createRepositories(db);

  runRepository.saveRun({
    userId: "user-1",
    cadence: "daily",
    resetWindow: "2026-03-28",
    sequenceNumber: 1,
    contractId: "daily-serious-a",
    contractTitle: "Serious Roller",
    contractDescription: "Roll ten times.",
    difficulty: "serious",
    objectiveType: "roll_count",
    requiredCount: 10,
    currentCount: 4,
    acceptedVia: "initial",
    acceptedAt: new Date("2026-03-28T10:05:00.000Z"),
    rewardPips: 25,
  });
  runRepository.saveRun({
    userId: "user-1",
    cadence: "daily",
    resetWindow: "2026-03-28",
    sequenceNumber: 1,
    contractId: "daily-serious-a",
    contractTitle: "Serious Roller",
    contractDescription: "Roll ten times.",
    difficulty: "serious",
    objectiveType: "roll_count",
    requiredCount: 10,
    currentCount: 10,
    acceptedVia: "initial",
    acceptedAt: new Date("2026-03-28T10:05:00.000Z"),
    completedAt: new Date("2026-03-28T11:00:00.000Z"),
    rewardPips: 25,
    rewardGrantedAt: new Date("2026-03-28T11:00:05.000Z"),
  });
  runRepository.saveRun({
    userId: "user-1",
    cadence: "daily",
    resetWindow: "2026-03-28",
    sequenceNumber: 2,
    contractId: "daily-serious-b",
    contractTitle: "Serious Encore",
    contractDescription: "Roll fifteen times.",
    difficulty: "serious",
    objectiveType: "roll_count",
    requiredCount: 15,
    currentCount: 3,
    acceptedVia: "refill",
    acceptedAt: new Date("2026-03-28T11:01:00.000Z"),
    rewardPips: 30,
  });

  assert.deepEqual(runRepository.getRun("user-1", "daily", "2026-03-28", 1), {
    userId: "user-1",
    cadence: "daily",
    resetWindow: "2026-03-28",
    sequenceNumber: 1,
    contractId: "daily-serious-a",
    contractTitle: "Serious Roller",
    contractDescription: "Roll ten times.",
    difficulty: "serious",
    objectiveType: "roll_count",
    requiredCount: 10,
    currentCount: 10,
    acceptedVia: "initial",
    acceptedAt: new Date("2026-03-28T10:05:00.000Z"),
    completedAt: new Date("2026-03-28T11:00:00.000Z"),
    rewardPips: 25,
    rewardGrantedAt: new Date("2026-03-28T11:00:05.000Z"),
  });
  assert.deepEqual(
    runRepository
      .listRuns("user-1", "daily", "2026-03-28")
      .map((record) => `${record.sequenceNumber}:${record.contractId}:${record.acceptedVia}`),
    ["1:daily-serious-a:initial", "2:daily-serious-b:refill"],
  );
});

test("contract master reroll usage is tracked per difficulty and listed in difficulty order", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const { rerollUsageRepository } = createRepositories(db);

  rerollUsageRepository.saveUsage({
    userId: "user-1",
    cadence: "daily",
    resetWindow: "2026-03-28",
    difficulty: "brutal",
    usedAt: new Date("2026-03-28T10:03:00.000Z"),
  });
  rerollUsageRepository.saveUsage({
    userId: "user-1",
    cadence: "daily",
    resetWindow: "2026-03-28",
    difficulty: "simple",
    usedAt: new Date("2026-03-28T10:01:00.000Z"),
  });
  rerollUsageRepository.saveUsage({
    userId: "user-1",
    cadence: "daily",
    resetWindow: "2026-03-28",
    difficulty: "serious",
    usedAt: new Date("2026-03-28T10:02:00.000Z"),
  });

  assert.deepEqual(
    rerollUsageRepository
      .listUsage("user-1", "daily", "2026-03-28")
      .map((record) => record.difficulty),
    ["simple", "serious", "brutal"],
  );
  assert.equal(
    rerollUsageRepository
      .getUsage("user-1", "daily", "2026-03-28", "serious")
      ?.usedAt.toISOString(),
    "2026-03-28T10:02:00.000Z",
  );
});

test("contract master repositories reject reused contract ids within the same reset window", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const { initialOfferRepository, runRepository } = createRepositories(db);

  initialOfferRepository.saveOffer({
    cadence: "weekly",
    difficulty: "simple",
    resetWindow: "2026-W13",
    contractId: "weekly-simple-a",
    createdAt: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.throws(
    () =>
      initialOfferRepository.saveOffer({
        cadence: "weekly",
        difficulty: "serious",
        resetWindow: "2026-W13",
        contractId: "weekly-simple-a",
        createdAt: new Date("2026-03-28T12:01:00.000Z"),
      }),
    /UNIQUE constraint failed/,
  );

  runRepository.saveRun({
    userId: "user-1",
    cadence: "weekly",
    resetWindow: "2026-W13",
    sequenceNumber: 1,
    contractId: "weekly-simple-a",
    contractTitle: "Simple Weekly",
    contractDescription: "Complete the easy weekly task.",
    difficulty: "simple",
    objectiveType: "roll_count",
    requiredCount: 5,
    currentCount: 1,
    acceptedVia: "initial",
    acceptedAt: new Date("2026-03-28T12:02:00.000Z"),
    rewardPips: 12,
  });

  assert.throws(
    () =>
      runRepository.saveRun({
        userId: "user-1",
        cadence: "weekly",
        resetWindow: "2026-W13",
        sequenceNumber: 2,
        contractId: "weekly-simple-a",
        contractTitle: "Simple Weekly Again",
        contractDescription: "Try to reuse the same contract id.",
        difficulty: "simple",
        objectiveType: "roll_count",
        requiredCount: 5,
        currentCount: 0,
        acceptedVia: "refill",
        acceptedAt: new Date("2026-03-28T12:03:00.000Z"),
        rewardPips: 12,
      }),
    /UNIQUE constraint failed/,
  );
});
