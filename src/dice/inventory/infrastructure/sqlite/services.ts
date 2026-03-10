import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createSqlitePvpRepository } from "../../../pvp/infrastructure/sqlite/pvp-repository";
import { createDiceInventoryUseCase } from "../../application/manage-inventory/use-case";
import { createDiceShopUseCase } from "../../application/manage-shop/use-case";
import { createDiceItemEffectsService } from "../../application/item-effects-service";
import { createUseDiceItemUseCase } from "../../application/use-item/use-case";
import { createSqliteInventoryRepository, createDiceShopCatalog } from "./inventory-repository";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";

export const createSqliteUseDiceItemUseCase = (db: SqliteDatabase) => {
  const unitOfWork = createSqliteUnitOfWork(db);
  const inventory = createSqliteInventoryRepository(db);
  const itemEffects = createDiceItemEffectsService(createSqliteProgressionRepository(db));
  const pvp = createSqlitePvpRepository(db);
  const shopCatalog = createDiceShopCatalog();

  return createUseDiceItemUseCase({
    inventory,
    itemEffects,
    pvp,
    shopCatalog,
    unitOfWork,
  });
};

export const createSqliteDiceInventoryUseCase = (db: SqliteDatabase) => {
  const inventory = createSqliteInventoryRepository(db);
  const useDiceItem = createSqliteUseDiceItemUseCase(db);

  return createDiceInventoryUseCase({
    inventory,
    useDiceItem,
  });
};

export const createSqliteDiceShopUseCase = (db: SqliteDatabase) => {
  const economy = createSqliteEconomyRepository(db);
  const inventory = createSqliteInventoryRepository(db);
  const shopCatalog = createDiceShopCatalog();
  const unitOfWork = createSqliteUnitOfWork(db);

  return createDiceShopUseCase({
    economy,
    inventory,
    shopCatalog,
    unitOfWork,
  });
};
