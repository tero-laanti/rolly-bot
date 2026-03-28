import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";

const moduleRequire = createRequire(__filename);
const exampleRollyDataDir = path.resolve(__dirname, "../../../../../example-data/rolly-data");

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

const clearContractsModuleGraph = (): void => {
  clearModules([
    "../../../../rolly-data/load",
    "../../../../rolly-data/paths",
    "../contract-master-service",
    "../rolly-data/contracts-catalog",
    "./services",
  ]);
};

const withEnv = (overrides: Record<string, string | undefined>, run: () => void): void => {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    process.env = previous;
  }
};

const createRollyDataCopyWithoutContracts = (targetDir: string): void => {
  fs.cpSync(exampleRollyDataDir, targetDir, { recursive: true });
  fs.rmSync(path.join(targetDir, "contracts.v2.json"), { force: true });
};

test("createSqliteContractsGameplayProgressPort disables contracts for missing local contracts.v2.json", () => {
  const originalCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "contracts-services-local-"));
  const projectDir = path.join(tempRoot, "project");
  const localRollyDataDir = path.join(projectDir, "rolly-data");

  fs.mkdirSync(projectDir, { recursive: true });
  createRollyDataCopyWithoutContracts(localRollyDataDir);

  withEnv({ ROLLY_DATA_DIR: undefined }, () => {
    process.chdir(projectDir);
    clearContractsModuleGraph();

    try {
      const services = moduleRequire("./services") as typeof import("./services");
      const db = new Database(":memory:");
      initializeDatabaseSchema(db);

      assert.equal(services.createSqliteContractsGameplayProgressPort(db), undefined);
    } finally {
      process.chdir(originalCwd);
      clearContractsModuleGraph();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

test("strict contracts resolver still fails loudly when local contracts.v2.json is missing", () => {
  const originalCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "contracts-services-strict-"));
  const projectDir = path.join(tempRoot, "project");
  const localRollyDataDir = path.join(projectDir, "rolly-data");

  fs.mkdirSync(projectDir, { recursive: true });
  createRollyDataCopyWithoutContracts(localRollyDataDir);

  withEnv({ ROLLY_DATA_DIR: undefined }, () => {
    process.chdir(projectDir);
    clearContractsModuleGraph();

    try {
      const services = moduleRequire("./services") as typeof import("./services");
      const db = new Database(":memory:");
      initializeDatabaseSchema(db);
      const resolver = services.createSqliteContractsRotationResolver(db);

      assert.throws(
        () => resolver.resolveActiveRotation(new Date("2026-03-28T11:00:00.000Z")),
        /Contracts data is unavailable/i,
      );
    } finally {
      process.chdir(originalCwd);
      clearContractsModuleGraph();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

test("gameplay progress port still throws when contracts.v2.json exists but is invalid", () => {
  const originalCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "contracts-services-invalid-"));
  const projectDir = path.join(tempRoot, "project");
  const localRollyDataDir = path.join(projectDir, "rolly-data");

  fs.mkdirSync(projectDir, { recursive: true });
  fs.cpSync(exampleRollyDataDir, localRollyDataDir, { recursive: true });
  fs.writeFileSync(path.join(localRollyDataDir, "contracts.v2.json"), "{}\n");

  withEnv({ ROLLY_DATA_DIR: undefined }, () => {
    process.chdir(projectDir);
    clearContractsModuleGraph();

    try {
      const services = moduleRequire("./services") as typeof import("./services");
      const db = new Database(":memory:");
      initializeDatabaseSchema(db);

      assert.throws(
        () => services.createSqliteContractsGameplayProgressPort(db),
        /contracts\.(panel|daily|weekly)/i,
      );
    } finally {
      process.chdir(originalCwd);
      clearContractsModuleGraph();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

test("services wire Contract Master acceptance, gameplay progress, and summary replies together", () => {
  withEnv({ ROLLY_DATA_DIR: exampleRollyDataDir }, () => {
    clearContractsModuleGraph();

    try {
      const services = moduleRequire("./services") as typeof import("./services");
      const db = new Database(":memory:");
      initializeDatabaseSchema(db);
      const now = new Date("2026-03-28T11:00:00.000Z");
      const service = services.createSqliteContractMasterService(db);
      const gameplayPort = services.createSqliteContractsGameplayProgressPort(db);
      const queryContracts = services.createSqliteQueryContractsUseCase(db);

      assert.ok(gameplayPort);

      service.acceptOffer({
        userId: "player-1",
        cadence: "daily",
        difficulty: "simple",
        now,
      });

      for (let index = 0; index < 12; index += 1) {
        gameplayPort?.recordRoll({
          userId: "player-1",
          occurredAt: now,
        });
      }

      const reply = queryContracts.createContractsReply({
        userId: "player-1",
        userMention: "<@player-1>",
        now,
      });

      assert.match(reply.content, /Daily Contracts/);
      assert.match(reply.content, /Completed this window: 1\/2/);
      assert.match(reply.content, /Available for simple difficulty\./);
    } finally {
      clearContractsModuleGraph();
    }
  });
});

test("contract master chooser groups each difficulty on its own row with player-facing objectives", () => {
  withEnv({ ROLLY_DATA_DIR: exampleRollyDataDir }, () => {
    clearContractsModuleGraph();

    try {
      const services = moduleRequire("./services") as typeof import("./services");
      const db = new Database(":memory:");
      initializeDatabaseSchema(db);
      const now = new Date("2026-03-28T11:00:00.000Z");
      const service = services.createSqliteContractMasterService(db);

      const view = service.createChooserView({
        userId: "player-1",
        cadence: "weekly",
        now,
      });

      assert.match(view.content, /Objective: Roll 80 time\(s\)/);
      assert.doesNotMatch(view.content, /Objective: roll_count 80 time\(s\)/);
      assert.deepEqual(
        view.components.map((row) => row.map((button) => button.label)),
        [
          ["Daily Contracts", "Weekly Contracts"],
          ["Reroll Simple", "Accept Simple"],
          ["Reroll Serious", "Accept Serious"],
          ["Reroll Brutal", "Accept Brutal"],
        ],
      );
    } finally {
      clearContractsModuleGraph();
    }
  });
});
