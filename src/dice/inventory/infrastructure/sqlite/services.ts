import type { SqliteDatabase } from "../../../../shared/db";
import { createSqliteUnitOfWork } from "../../../../shared/infrastructure/sqlite/unit-of-work";
import { createSqliteEconomyRepository } from "../../../economy/infrastructure/sqlite/balance-repository";
import { createSqlitePvpRepository } from "../../../pvp/infrastructure/sqlite/pvp-repository";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";
import { triggerRandomGroupEventNow } from "../../../random-events/infrastructure/admin-controller";
import { createDiceInventoryUseCase } from "../../application/manage-inventory/use-case";
import { createDiceShopUseCase } from "../../application/manage-shop/use-case";
import {
  createFinalizeAutoRollItemUseUseCase,
  createUseDiceItemUseCase,
} from "../../application/use-item/use-case";
import { createSqliteInventoryRepository, createDiceShopCatalog } from "./inventory-repository";
import { createSqliteDiceItemEffectsService } from "./item-effects-service";

export const createSqliteUseDiceItemUseCase = (db: SqliteDatabase) => {
  const unitOfWork = createSqliteUnitOfWork(db);
  const inventory = createSqliteInventoryRepository(db);
  const itemEffects = createSqliteDiceItemEffectsService(db);
  const pvp = createSqlitePvpRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const shopCatalog = createDiceShopCatalog();

  return createUseDiceItemUseCase({
    inventory,
    itemEffects,
    pvp,
    progression,
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

export const createSqliteDiceInventoryCommandServices = (db: SqliteDatabase) => {
  const unitOfWork = createSqliteUnitOfWork(db);
  const inventory = createSqliteInventoryRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const useDiceItem = createSqliteUseDiceItemUseCase(db);
  const finalizeAutoRollItemUse = createFinalizeAutoRollItemUseUseCase({
    inventory,
    progression,
    unitOfWork,
  });

  return {
    inventoryUseCase: createDiceInventoryUseCase({
      inventory,
      useDiceItem,
    }),
    finalizeAutoRollItemUse,
    refundInventoryItem: (input: { userId: string; itemId: string; quantity?: number }) =>
      inventory.grantInventoryItem(input),
    triggerRandomGroupEvent: triggerRandomGroupEventNow,
  };
};

export const createSqliteDiceShopUseCase = (db: SqliteDatabase) => {
  const economy = createSqliteEconomyRepository(db);
  const inventory = createSqliteInventoryRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const shopCatalog = createDiceShopCatalog();
  const unitOfWork = createSqliteUnitOfWork(db);

  return createDiceShopUseCase({
    economy,
    inventory,
    progression,
    shopCatalog,
    unitOfWork,
  });
};
