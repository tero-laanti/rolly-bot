import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const moduleRequire = createRequire(__filename);
const exampleRollyDataDir = path.resolve(__dirname, "../../example-data/rolly-data");

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
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
  fs.rmSync(path.join(targetDir, "contracts.v1.json"), { force: true });
  fs.rmSync(path.join(targetDir, "contracts.v2.json"), { force: true });
};

test("primeRollyData allows missing contracts.v1.json in the implicit local rolly-data source", () => {
  const originalCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rolly-data-local-"));
  const projectDir = path.join(tempRoot, "project");
  const localRollyDataDir = path.join(projectDir, "rolly-data");

  fs.mkdirSync(projectDir, { recursive: true });
  createRollyDataCopyWithoutContracts(localRollyDataDir);

  withEnv({ ROLLY_DATA_DIR: undefined }, () => {
    process.chdir(projectDir);
    clearModules(["./load", "./paths"]);

    try {
      const load = moduleRequire("./load") as typeof import("./load");
      const loaded = load.primeRollyData();

      assert.equal(loaded.source.kind, "local");
      assert.equal(load.getOptionalDiceContractsV1Data(), null);
      assert.throws(
        () => load.getDiceContractsV1Data(),
        /Contracts data is unavailable .* Add contracts\.v1\.json or contracts\.v2\.json to enable contracts\./i,
      );
    } finally {
      process.chdir(originalCwd);
      clearModules(["./load", "./paths"]);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

test("primeRollyData still fails for explicit ROLLY_DATA_DIR sources missing contracts.v1.json", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rolly-data-env-"));
  createRollyDataCopyWithoutContracts(tempRoot);

  withEnv({ ROLLY_DATA_DIR: tempRoot }, () => {
    clearModules(["./load", "./paths"]);

    try {
      const load = moduleRequire("./load") as typeof import("./load");

      assert.throws(
        () => load.primeRollyData(),
        /Required rolly-data file is missing: .*contracts\.v1\.json.*contracts\.v2\.json/i,
      );
    } finally {
      clearModules(["./load", "./paths"]);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

test("primeRollyData falls back to contracts.v2.json when contracts.v1.json is absent", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rolly-data-v2-"));
  fs.cpSync(exampleRollyDataDir, tempRoot, { recursive: true });
  fs.rmSync(path.join(tempRoot, "contracts.v1.json"), { force: true });
  fs.copyFileSync(
    path.join(exampleRollyDataDir, "contracts.v1.json"),
    path.join(tempRoot, "contracts.v2.json"),
  );

  withEnv({ ROLLY_DATA_DIR: tempRoot }, () => {
    clearModules(["./load", "./paths"]);

    try {
      const load = moduleRequire("./load") as typeof import("./load");
      const loaded = load.primeRollyData();

      assert.equal(loaded.contractsV1?.daily.length, 4);
      assert.equal(loaded.contractsV1?.weekly.length, 3);
    } finally {
      clearModules(["./load", "./paths"]);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
