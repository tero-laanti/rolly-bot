import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";
import { createQueryDiceBalanceUseCase } from "../../application/query-balance/use-case";
import { createQueryDiceLeaderboardsUseCase } from "../../application/query-leaderboards/use-case";
import { createSqliteEconomyRepository } from "./balance-repository";

export const createSqliteQueryDiceBalanceUseCase = (db: SqliteDatabase) => {
  const economy = createSqliteEconomyRepository(db);

  return createQueryDiceBalanceUseCase({
    economy,
  });
};

export const createSqliteQueryDiceLeaderboardsUseCase = (db: SqliteDatabase) => {
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);

  return createQueryDiceLeaderboardsUseCase({
    economy,
    progression,
  });
};
