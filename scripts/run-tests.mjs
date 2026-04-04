import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const compiledRootArg = process.argv[2];
const rawSelectorArgs = process.argv.slice(3);
const distRoot = compiledRootArg ? join(projectRoot, compiledRootArg) : join(projectRoot, "dist");
const exampleRollyDataRoot = join(projectRoot, "example-data", "rolly-data");
const privateRollyDataRoot = join(projectRoot, "rolly-data");
const privateRandomEventsPack = join(privateRollyDataRoot, "random-events.v1.json");

const normalizePath = (value) => value.replace(/\\/g, "/").replace(/^\.\//, "");

const parseSelectorArgs = (args) => {
  const selectors = [];
  const nodeTestArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--test") {
      const nextArg = args[index + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        selectors.push(nextArg);
        index += 1;
        continue;
      }

      nodeTestArgs.push(arg);
      continue;
    }

    if (arg.startsWith("--test=")) {
      selectors.push(arg.slice("--test=".length));
      continue;
    }

    if (arg.startsWith("--")) {
      nodeTestArgs.push(arg);
      continue;
    }

    selectors.push(arg);
  }

  return {
    selectors,
    nodeTestArgs,
  };
};

const buildSelectorCandidates = (selector) => {
  const normalized = normalizePath(selector);
  const candidates = new Set([normalized]);
  const extension = extname(normalized);

  if (normalized.startsWith("src/")) {
    candidates.add(normalized.slice("src/".length));
  }

  if (compiledRootArg) {
    const compiledRootPrefix = `${normalizePath(compiledRootArg)}/`;
    if (normalized.startsWith(compiledRootPrefix)) {
      candidates.add(normalized.slice(compiledRootPrefix.length));
    }
  }

  if (extension === ".ts") {
    for (const candidate of [...candidates]) {
      candidates.add(candidate.slice(0, -3) + ".js");
    }
  }

  return [...candidates];
};

const matchesSelector = (testFile, selector) => {
  const normalizedTestFile = normalizePath(testFile);
  const candidates = buildSelectorCandidates(selector);

  return candidates.some((candidate) => {
    if (candidate.length < 1) {
      return false;
    }

    const normalizedCandidate = normalizePath(candidate).replace(/\/$/, "");
    const extension = extname(normalizedCandidate);

    if (extension.length > 0) {
      return (
        normalizedTestFile === normalizedCandidate ||
        normalizedTestFile.endsWith(`/${normalizedCandidate}`)
      );
    }

    return (
      normalizedTestFile.includes(`/${normalizedCandidate}/`) ||
      normalizedTestFile.endsWith(`/${normalizedCandidate}`)
    );
  });
};

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
  console.error(`Compiled test directory ${distRoot} does not exist. Run npm test again.`);
  process.exit(1);
}

const testFiles = collectCompiledTestFiles(distRoot).sort();

if (testFiles.length < 1) {
  console.error(`No compiled test files were found under ${distRoot}.`);
  process.exit(1);
}

const runCompiledTests = (selectedTestFiles, rollyDataDir, label) => {
  const result = spawnSync(process.execPath, ["--test", ...nodeTestArgs, ...selectedTestFiles], {
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

const { selectors, nodeTestArgs } = parseSelectorArgs(rawSelectorArgs);

const selectedTestFiles =
  selectors.length < 1
    ? testFiles
    : selectors.flatMap((selector) => {
        const matches = testFiles.filter((testFile) => matchesSelector(testFile, selector));
        if (matches.length < 1) {
          console.error(`No compiled test files matched selector "${selector}".`);
          process.exit(1);
        }

        return matches;
      });

const uniqueSelectedTestFiles = [...new Set(selectedTestFiles)].sort();

runCompiledTests(uniqueSelectedTestFiles, exampleRollyDataRoot, "example-data/rolly-data");

const privatePackFiles = [
  join(distRoot, "dice", "random-events", "domain", "content-balance.test.js"),
  join(distRoot, "rolly-data", "load-current-pack.test.js"),
];

const selectedPrivatePackFiles = privatePackFiles.filter((file) =>
  uniqueSelectedTestFiles.includes(file),
);

if (
  selectedPrivatePackFiles.every((file) => existsSync(file)) &&
  selectedPrivatePackFiles.length > 0 &&
  existsSync(privateRandomEventsPack)
) {
  runCompiledTests(selectedPrivatePackFiles, privateRollyDataRoot, "rolly-data");
}
