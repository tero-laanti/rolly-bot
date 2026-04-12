import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createContractsGameplayProgressPort } from "../../application/gameplay-progress/use-case";
import { createQueryContractsUseCase } from "../../application/query-contracts/use-case";
import { createRecordContractsProgressUseCase } from "../../application/record-progress/use-case";
import { createResolveContractCadenceViewUseCase } from "../../application/resolve-rotation/use-case";
import {
  createOptionalRollyDataContractsCatalogReader,
  createRollyDataContractsCatalogReader,
} from "../rolly-data/contracts-catalog";
import {
  createOptionalSqliteContractMasterService,
  createSqliteContractMasterService,
} from "../contract-master-service";
import {
  createSqliteContractMasterInitialOfferRepository,
  createSqliteContractMasterRerollUsageRepository,
  createSqliteContractMasterRunRepository,
  createSqliteContractMasterUserCadenceStateRepository,
} from "./contract-master-repository";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";

const createUnavailableContractsReply = () => {
  return {
    content:
      "**Rolly Contracts**\nContracts are currently unavailable on this bot. Add `contracts.v2.json` to the active rolly-data source to enable /contracts.",
    ephemeral: false as const,
  };
};

const createStrictContractMasterDependencies = (db: SqliteDatabase) => {
  const catalogReader = createRollyDataContractsCatalogReader();

  return {
    catalogReader,
    initialOfferRepository: createSqliteContractMasterInitialOfferRepository(db),
    userCadenceStateRepository: createSqliteContractMasterUserCadenceStateRepository(db),
    runRepository: createSqliteContractMasterRunRepository(db),
    rerollUsageRepository: createSqliteContractMasterRerollUsageRepository(db),
    unitOfWork: createSqliteUnitOfWork(db),
  };
};

const createOptionalContractMasterDependencies = (db: SqliteDatabase) => {
  const catalogReader = createOptionalRollyDataContractsCatalogReader();
  if (!catalogReader) {
    return null;
  }

  catalogReader.getCatalog();

  return {
    catalogReader,
    initialOfferRepository: createSqliteContractMasterInitialOfferRepository(db),
    userCadenceStateRepository: createSqliteContractMasterUserCadenceStateRepository(db),
    runRepository: createSqliteContractMasterRunRepository(db),
    rerollUsageRepository: createSqliteContractMasterRerollUsageRepository(db),
    unitOfWork: createSqliteUnitOfWork(db),
  };
};

const createRewardGranter = (db: SqliteDatabase) => {
  const economy = createSqliteEconomyRepository(db);

  return {
    grantPips: (userId: string, pips: number) => {
      if (pips > 0) {
        economy.applyPipsDelta({ userId, amount: pips });
      }
    },
  };
};

export const createSqliteContractsRotationResolver = (db: SqliteDatabase) => {
  const dependencies = createStrictContractMasterDependencies(db);

  return createResolveContractCadenceViewUseCase({
    catalogReader: dependencies.catalogReader,
    initialOfferRepository: dependencies.initialOfferRepository,
    userCadenceStateRepository: dependencies.userCadenceStateRepository,
    runRepository: dependencies.runRepository,
    rerollUsageRepository: dependencies.rerollUsageRepository,
  });
};

export const createSqliteContractsProgressRecorder = (db: SqliteDatabase) => {
  const dependencies = createStrictContractMasterDependencies(db);

  return createRecordContractsProgressUseCase({
    catalogReader: dependencies.catalogReader,
    runRepository: dependencies.runRepository,
    userCadenceStateRepository: dependencies.userCadenceStateRepository,
    rewardGranter: createRewardGranter(db),
    unitOfWork: dependencies.unitOfWork,
  });
};

export const createSqliteContractsGameplayProgressPort = (db: SqliteDatabase) => {
  const dependencies = createOptionalContractMasterDependencies(db);
  if (dependencies === null) {
    return undefined;
  }

  return createContractsGameplayProgressPort({
    progressRecorder: createRecordContractsProgressUseCase({
      catalogReader: dependencies.catalogReader,
      runRepository: dependencies.runRepository,
      userCadenceStateRepository: dependencies.userCadenceStateRepository,
      rewardGranter: createRewardGranter(db),
      unitOfWork: dependencies.unitOfWork,
    }),
  });
};

export const createSqliteQueryContractsUseCase = (db: SqliteDatabase) => {
  const dependencies = createOptionalContractMasterDependencies(db);
  if (dependencies === null) {
    return {
      createContractsReply: () => createUnavailableContractsReply(),
    };
  }

  return createQueryContractsUseCase({
    cadenceResolver: createResolveContractCadenceViewUseCase({
      catalogReader: dependencies.catalogReader,
      initialOfferRepository: dependencies.initialOfferRepository,
      userCadenceStateRepository: dependencies.userCadenceStateRepository,
      runRepository: dependencies.runRepository,
      rerollUsageRepository: dependencies.rerollUsageRepository,
    }),
  });
};

export { createOptionalSqliteContractMasterService, createSqliteContractMasterService };
