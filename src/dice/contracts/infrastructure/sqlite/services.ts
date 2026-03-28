import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createContractsGameplayProgressPort } from "../../application/gameplay-progress/use-case";
import { createQueryContractsUseCase } from "../../application/query-contracts/use-case";
import { createRecordContractsProgressUseCase } from "../../application/record-progress/use-case";
import { createResolveContractsRotationUseCase } from "../../application/resolve-rotation/use-case";
import type {
  ContractsCatalogReader,
  ContractsGameplayProgressPort,
  ContractsRewardGranter,
} from "../../application/ports";
import {
  createOptionalRollyDataContractsCatalogReader,
  createRollyDataContractsCatalogReader,
} from "../rolly-data/contracts-catalog";
import {
  createSqliteContractsProgressRepository,
  createSqliteContractsRotationRepository,
} from "./contracts-repository";

const createSqliteContractsRewardGranter = (db: SqliteDatabase): ContractsRewardGranter => {
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

const createContractsProgressRecorder = (
  db: SqliteDatabase,
  catalogReader: ContractsCatalogReader,
) => {
  const rotationRepository = createSqliteContractsRotationRepository(db);
  const progressRepository = createSqliteContractsProgressRepository(db);
  const rewardGranter = createSqliteContractsRewardGranter(db);
  const unitOfWork = createSqliteUnitOfWork(db);

  const rotationResolver = createResolveContractsRotationUseCase({
    catalogReader,
    rotationRepository,
  });

  return createRecordContractsProgressUseCase({
    rotationResolver,
    progressRepository,
    rewardGranter,
    unitOfWork,
  });
};

export const createSqliteContractsRotationResolver = (db: SqliteDatabase) => {
  const catalogReader = createRollyDataContractsCatalogReader();
  const rotationRepository = createSqliteContractsRotationRepository(db);

  return createResolveContractsRotationUseCase({
    catalogReader,
    rotationRepository,
  });
};

export const createSqliteContractsProgressRecorder = (db: SqliteDatabase) => {
  return createContractsProgressRecorder(db, createRollyDataContractsCatalogReader());
};

export const createSqliteContractsGameplayProgressPort = (
  db: SqliteDatabase,
): ContractsGameplayProgressPort | undefined => {
  const catalogReader = createOptionalRollyDataContractsCatalogReader();
  if (catalogReader === null) {
    return undefined;
  }

  const progressRecorder = createContractsProgressRecorder(db, catalogReader);
  return createContractsGameplayProgressPort({
    progressRecorder,
  });
};

export const createSqliteQueryContractsUseCase = (db: SqliteDatabase) => {
  const catalogReader = createOptionalRollyDataContractsCatalogReader();
  const progressRepository = createSqliteContractsProgressRepository(db);

  return createQueryContractsUseCase({
    rotationResolver:
      catalogReader === null
        ? null
        : createResolveContractsRotationUseCase({
            catalogReader,
            rotationRepository: createSqliteContractsRotationRepository(db),
          }),
    progressRepository,
  });
};
