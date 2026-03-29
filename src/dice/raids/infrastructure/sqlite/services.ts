import type { SqliteDatabase } from "../../../../shared/db";
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
}: {
  db: SqliteDatabase;
  catalogReader: RaidCatalogReader;
  inspector: RaidRecoveryInspector;
  publishStatusMessage: PublishRaidStatusMessage;
}) => {
  return createRecoverRaidRunsUseCase({
    catalogReader,
    repository: createSqliteRaidRunRepository(db),
    inspector,
    publishStatusMessage,
    buildRecruitmentView: (raidRun) => buildRaidRecruitmentView(catalogReader, raidRun),
  });
};
