import type { SqliteDatabase } from "../../../../shared/db";
import { createExpireRecruitingRaidRunsUseCase } from "../../application/expire-recruiting-runs/use-case";
import {
  buildRaidRecruitmentView,
  createManageRaidLobbyUseCase,
} from "../../application/manage-lobby/use-case";
import { createRecoverRaidRunsUseCase } from "../../application/recover-runs/use-case";
import type {
  PublishRaidStatusMessage,
  RaidCatalogReader,
  RaidInstanceProvisioner,
  RaidRecoveryInspector,
  UpdateRaidStatusMessage,
} from "../../application/ports";
import { createSqliteRaidRunRepository } from "./raid-run-repository";

export const createSqliteManageRaidLobbyUseCase = ({
  db,
  catalogReader,
  provisioner,
}: {
  db: SqliteDatabase;
  catalogReader: RaidCatalogReader;
  provisioner: RaidInstanceProvisioner;
}) => {
  return createManageRaidLobbyUseCase({
    catalogReader,
    repository: createSqliteRaidRunRepository(db),
    provisioner,
  });
};

export const createSqliteRecoverRaidRunsUseCase = ({
  db,
  catalogReader,
  inspector,
  publishStatusMessage,
  updateStatusMessage,
}: {
  db: SqliteDatabase;
  catalogReader: RaidCatalogReader;
  inspector: RaidRecoveryInspector;
  publishStatusMessage: PublishRaidStatusMessage;
  updateStatusMessage: UpdateRaidStatusMessage;
}) => {
  return createRecoverRaidRunsUseCase({
    catalogReader,
    repository: createSqliteRaidRunRepository(db),
    inspector,
    publishStatusMessage,
    updateStatusMessage,
    buildRecruitmentView: (raidRun) => buildRaidRecruitmentView(catalogReader, raidRun),
  });
};

export const createSqliteExpireRecruitingRaidRunsUseCase = ({
  db,
  catalogReader,
  updateStatusMessage,
}: {
  db: SqliteDatabase;
  catalogReader: RaidCatalogReader;
  updateStatusMessage: UpdateRaidStatusMessage;
}) => {
  return createExpireRecruitingRaidRunsUseCase({
    repository: createSqliteRaidRunRepository(db),
    updateStatusMessage,
    buildRecruitmentView: (raidRun) => buildRaidRecruitmentView(catalogReader, raidRun),
  });
};
