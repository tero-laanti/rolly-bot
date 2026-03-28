import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import {
  createSqliteContractsRotationRepository,
  createSqliteContractsProgressRepository,
} from "./contracts-repository";
import { createContractsGameplayProgressPort } from "../../application/gameplay-progress/use-case";
import { createResolveContractsRotationUseCase } from "../../application/resolve-rotation/use-case";
import { createRecordContractsProgressUseCase } from "../../application/record-progress/use-case";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import type { ContractDefinition } from "../../domain/types";
import type { ContractsCatalogReader, ContractsRewardGranter } from "../../application/ports";

const makeCatalogReader = (): ContractsCatalogReader => {
  const daily = [
    {
      id: "daily-roll-a",
      title: "Roll once",
      description: "Roll the dice",
      cadence: "daily" as const,
      objective: { type: "roll_count" as const, requiredCount: 2 },
      reward: { fame: 1, pips: 3 },
    },
    {
      id: "daily-roll-b",
      title: "Roll twice",
      description: "Roll again",
      cadence: "daily" as const,
      objective: { type: "pvp_win_count" as const, requiredCount: 1 },
      reward: { fame: 0, pips: 2 },
    },
  ];

  const weekly = [
    {
      id: "weekly-roll-a",
      title: "Weekly roller",
      description: "Roll a bunch",
      cadence: "weekly" as const,
      objective: { type: "roll_count" as const, requiredCount: 3 },
      reward: { fame: 2, pips: 5 },
    },
    {
      id: "weekly-pvp-a",
      title: "Win PvP",
      description: "Win once",
      cadence: "weekly" as const,
      objective: { type: "pvp_win_count" as const, requiredCount: 1 },
      reward: { fame: 4, pips: 0 },
    },
  ];

  return {
    getCatalog: () => ({
      daily,
      weekly,
    }),
  };
};

const makeCatalogReaderFromContracts = (input: {
  daily: ContractDefinition[];
  weekly: ContractDefinition[];
}): ContractsCatalogReader => ({
  getCatalog: () => input,
});

const createSqliteContractsRewardGranter = (db: Database.Database): ContractsRewardGranter => {
  const economy = createSqliteEconomyRepository(db);

  return {
    grantReward: (userId, reward) => {
      if (reward.fame > 0) {
        economy.applyFameDelta({ userId, amount: reward.fame });
      }
      if (reward.pips > 0) {
        economy.applyPipsDelta({ userId, amount: reward.pips });
      }
    },
  };
};

test("contract rotation is persisted and reused within the same period", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const catalogReader = makeCatalogReader();
  const rotationRepository = createSqliteContractsRotationRepository(db);
  const resolver = createResolveContractsRotationUseCase({ catalogReader, rotationRepository });

  const first = resolver.resolveActiveRotation(new Date("2026-03-27T10:00:00.000Z"));
  const second = resolver.resolveActiveRotation(new Date("2026-03-27T18:00:00.000Z"));

  assert.deepEqual(
    second.daily.contracts.map((contract) => contract.id),
    first.daily.contracts.map((contract) => contract.id),
  );
  assert.deepEqual(
    second.weekly.contracts.map((contract) => contract.id),
    first.weekly.contracts.map((contract) => contract.id),
  );

  const persistedDaily = rotationRepository.getRotation("daily", first.daily.periodKey);
  assert(persistedDaily);
  assert.equal(persistedDaily.contractIds.length, first.daily.contracts.length);
});

test("persisted same-period rotation fails loudly instead of reseeding on catalog drift", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const originalCatalogReader = makeCatalogReader();
  const rotationRepository = createSqliteContractsRotationRepository(db);
  const originalResolver = createResolveContractsRotationUseCase({
    catalogReader: originalCatalogReader,
    rotationRepository,
  });

  const first = originalResolver.resolveActiveRotation(new Date("2026-03-27T10:00:00.000Z"));
  const driftedCatalogReader = makeCatalogReaderFromContracts({
    daily: [
      {
        id: "daily-roll-b",
        title: "Roll twice",
        description: "Roll again",
        cadence: "daily",
        objective: { type: "pvp_win_count", requiredCount: 1 },
        reward: { fame: 0, pips: 2 },
      },
    ],
    weekly: [
      {
        id: "weekly-roll-a",
        title: "Weekly roller",
        description: "Roll a bunch",
        cadence: "weekly",
        objective: { type: "roll_count", requiredCount: 3 },
        reward: { fame: 2, pips: 5 },
      },
      {
        id: "weekly-pvp-a",
        title: "Win PvP",
        description: "Win once",
        cadence: "weekly",
        objective: { type: "pvp_win_count", requiredCount: 1 },
        reward: { fame: 4, pips: 0 },
      },
    ],
  });
  const driftedResolver = createResolveContractsRotationUseCase({
    catalogReader: driftedCatalogReader,
    rotationRepository,
  });

  assert.throws(
    () => driftedResolver.resolveActiveRotation(new Date("2026-03-27T18:00:00.000Z")),
    /no longer matches the catalog/,
  );

  const persistedDaily = rotationRepository.getRotation("daily", first.daily.periodKey);
  assert(persistedDaily);
  assert.deepEqual(
    persistedDaily.contractIds,
    first.daily.contracts.map((contract) => contract.id),
  );
});

test("progress recording updates multiple active contracts atomically and does not double-award", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const catalogReader = makeCatalogReader();
  const rotationRepository = createSqliteContractsRotationRepository(db);
  const progressRepository = createSqliteContractsProgressRepository(db);
  const rewardGranter = createSqliteContractsRewardGranter(db);
  const unitOfWork = createSqliteUnitOfWork(db);
  const economy = createSqliteEconomyRepository(db);

  const rotationResolver = createResolveContractsRotationUseCase({
    catalogReader,
    rotationRepository,
  });
  const progressRecorder = createRecordContractsProgressUseCase({
    rotationResolver,
    progressRepository,
    rewardGranter,
    unitOfWork,
  });

  const now = new Date("2026-03-27T12:00:00.000Z");

  const first = progressRecorder.recordProgress({
    userId: "user-1",
    objectiveType: "roll_count",
    increment: 1,
    occurredAt: now,
  });

  assert(first);
  assert.equal(first.updates.length, 2, "daily and weekly roll contracts should both update");
  assert(first.updates.every((update) => update.rewardGranted === null));

  const second = progressRecorder.recordProgress({
    userId: "user-1",
    objectiveType: "roll_count",
    increment: 2,
    occurredAt: now,
  });

  assert(second);
  const rewardsGranted = second.updates.filter((update) => update.rewardGranted !== null);
  assert.equal(rewardsGranted.length, 2, "both contracts should auto-claim on completion");
  assert.deepEqual(economy.getEconomySnapshot("user-1"), {
    fame: 3,
    pips: 8,
  });

  const restartedProgressRecorder = createRecordContractsProgressUseCase({
    rotationResolver,
    progressRepository,
    rewardGranter,
    unitOfWork,
  });
  const third = progressRecorder.recordProgress({
    userId: "user-1",
    objectiveType: "roll_count",
    increment: 1,
    occurredAt: now,
  });

  const fourth = restartedProgressRecorder.recordProgress({
    userId: "user-1",
    objectiveType: "roll_count",
    increment: 1,
    occurredAt: now,
  });

  assert.equal(third, null, "no further progress once rewards are claimed");
  assert.equal(fourth, null, "retries after restart do not re-award completed contracts");
  assert.deepEqual(economy.getEconomySnapshot("user-1"), {
    fame: 3,
    pips: 8,
  });

  const rotation = rotationResolver.resolveActiveRotation(now);
  const dailyContract = rotation.daily.contracts.find(
    (contract) => contract.objective.type === "roll_count",
  );
  const weeklyContract = rotation.weekly.contracts.find(
    (contract) => contract.objective.type === "roll_count",
  );
  assert(dailyContract && weeklyContract);

  const dailyProgress = progressRepository.getProgress(
    "user-1",
    dailyContract.id,
    dailyContract.cadence,
    rotation.daily.periodKey,
  );
  const weeklyProgress = progressRepository.getProgress(
    "user-1",
    weeklyContract.id,
    weeklyContract.cadence,
    rotation.weekly.periodKey,
  );

  assert(dailyProgress?.rewardedAt);
  assert(weeklyProgress?.rewardedAt);
});

test("gameplay progress port increments only matching objective families", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const catalogReader = makeCatalogReaderFromContracts({
    daily: [
      {
        id: "daily-roll",
        title: "Roll",
        description: "Roll once",
        cadence: "daily",
        objective: { type: "roll_count", requiredCount: 1 },
        reward: { fame: 0, pips: 1 },
      },
      {
        id: "daily-casino",
        title: "Casino",
        description: "Play once",
        cadence: "daily",
        objective: { type: "casino_game_count", requiredCount: 1 },
        reward: { fame: 1, pips: 0 },
      },
    ],
    weekly: [
      {
        id: "weekly-pvp",
        title: "PvP",
        description: "Win once",
        cadence: "weekly",
        objective: { type: "pvp_win_count", requiredCount: 1 },
        reward: { fame: 2, pips: 0 },
      },
      {
        id: "weekly-boss",
        title: "Boss",
        description: "Join once",
        cadence: "weekly",
        objective: { type: "world_boss_join_count", requiredCount: 1 },
        reward: { fame: 0, pips: 2 },
      },
    ],
  });
  const rotationRepository = createSqliteContractsRotationRepository(db);
  const progressRepository = createSqliteContractsProgressRepository(db);
  const rewardGranter = createSqliteContractsRewardGranter(db);
  const unitOfWork = createSqliteUnitOfWork(db);
  const rotationResolver = createResolveContractsRotationUseCase({
    catalogReader,
    rotationRepository,
  });
  const gameplayProgress = createContractsGameplayProgressPort({
    progressRecorder: createRecordContractsProgressUseCase({
      rotationResolver,
      progressRepository,
      rewardGranter,
      unitOfWork,
    }),
  });
  const now = new Date("2026-03-27T12:00:00.000Z");
  const rotation = rotationResolver.resolveActiveRotation(now);

  gameplayProgress.recordRoll({ userId: "user-1", occurredAt: now });
  gameplayProgress.recordCasinoGameCompletion({ userId: "user-1", occurredAt: now });
  gameplayProgress.recordPvpWin({ userId: "user-1", occurredAt: now });
  gameplayProgress.recordWorldBossJoin({ userId: "user-1", occurredAt: now });

  const dailyRoll = rotation.daily.contracts.find((contract) => contract.id === "daily-roll");
  const dailyCasino = rotation.daily.contracts.find((contract) => contract.id === "daily-casino");
  const weeklyPvp = rotation.weekly.contracts.find((contract) => contract.id === "weekly-pvp");
  const weeklyBoss = rotation.weekly.contracts.find((contract) => contract.id === "weekly-boss");
  assert(dailyRoll && dailyCasino && weeklyPvp && weeklyBoss);

  assert.equal(
    progressRepository.getProgress(
      "user-1",
      dailyRoll.id,
      dailyRoll.cadence,
      rotation.daily.periodKey,
    )?.currentCount,
    1,
  );
  assert.equal(
    progressRepository.getProgress(
      "user-1",
      dailyCasino.id,
      dailyCasino.cadence,
      rotation.daily.periodKey,
    )?.currentCount,
    1,
  );
  assert.equal(
    progressRepository.getProgress(
      "user-1",
      weeklyPvp.id,
      weeklyPvp.cadence,
      rotation.weekly.periodKey,
    )?.currentCount,
    1,
  );
  assert.equal(
    progressRepository.getProgress(
      "user-1",
      weeklyBoss.id,
      weeklyBoss.cadence,
      rotation.weekly.periodKey,
    )?.currentCount,
    1,
  );
});

test("unsupported objective families fail loudly during progress recording", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const catalogReader = makeCatalogReaderFromContracts({
    daily: [
      {
        id: "bad-objective",
        title: "Bad",
        description: "Bad",
        cadence: "daily",
        objective: { type: "item_use_count" as never, requiredCount: 1 },
        reward: { fame: 0, pips: 1 },
      },
    ],
    weekly: [],
  });
  const rotationRepository = createSqliteContractsRotationRepository(db);
  const progressRepository = createSqliteContractsProgressRepository(db);
  const rewardGranter = createSqliteContractsRewardGranter(db);
  const unitOfWork = createSqliteUnitOfWork(db);
  const progressRecorder = createRecordContractsProgressUseCase({
    rotationResolver: createResolveContractsRotationUseCase({
      catalogReader,
      rotationRepository,
    }),
    progressRepository,
    rewardGranter,
    unitOfWork,
  });

  assert.throws(
    () =>
      progressRecorder.recordProgress({
        userId: "user-1",
        objectiveType: "roll_count",
        increment: 1,
        occurredAt: new Date("2026-03-27T12:00:00.000Z"),
      }),
    /Unsupported contract objective type/,
  );
});
