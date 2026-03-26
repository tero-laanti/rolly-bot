import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const distRoot = join(projectRoot, "dist");
const exampleRollyDataRoot = join(projectRoot, "example-data", "rolly-data");
const privateRollyDataRoot = join(projectRoot, "rolly-data");
const privateRandomEventsPack = join(privateRollyDataRoot, "random-events.v1.json");

const collectCompiledTestFiles = (directory) => {
  const entries = readdirSync(directory, { withFileTypes: true });
  const testFiles = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      testFiles.push(...collectCompiledTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      testFiles.push(entryPath);
    }
  }

  return testFiles;
};

if (!existsSync(distRoot)) {
  console.error("Compiled test directory dist/ does not exist. Run npm run build first.");
  process.exit(1);
}

const testFiles = collectCompiledTestFiles(distRoot).sort();

if (testFiles.length < 1) {
  console.error("No compiled test files were found under dist/.");
  process.exit(1);
}

const runCompiledTests = (selectedTestFiles, rollyDataDir, label) => {
  const result = spawnSync(process.execPath, ["--test", ...selectedTestFiles], {
    env: {
      ...process.env,
      ROLLY_DATA_DIR: rollyDataDir,
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    console.error(`Test run failed for ${label}.`);
    process.exit(result.status ?? 1);
  }
};

runCompiledTests(testFiles, exampleRollyDataRoot, "example-data/rolly-data");

const privatePackFiles = [
  join(distRoot, "dice", "random-events", "domain", "content-balance.test.js"),
  join(distRoot, "rolly-data", "load-current-pack.test.js"),
];

if (privatePackFiles.every((file) => existsSync(file)) && existsSync(privateRandomEventsPack)) {
  runCompiledTests(privatePackFiles, privateRollyDataRoot, "rolly-data");
}
