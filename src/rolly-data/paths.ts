import fs from "node:fs";
import path from "node:path";
import type { RollyDataSource } from "./types";

const dataDirEnvName = "ROLLY_DATA_DIR";
const localDataDirName = "rolly-data";
const exampleDataDirSegments = ["example-data", "rolly-data"] as const;

const resolveFromCwd = (value: string): string => {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
};

const assertDirectoryExists = (directory: string, label: string): void => {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(directory);
  } catch {
    throw new Error(`${label} does not exist: ${directory}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directory}`);
  }
};

export const resolveRollyDataSource = (): RollyDataSource => {
  const configuredDir = process.env[dataDirEnvName]?.trim();
  if (configuredDir) {
    const resolved = resolveFromCwd(configuredDir);
    assertDirectoryExists(resolved, dataDirEnvName);
    return { kind: "env", dir: resolved };
  }

  const localDir = path.resolve(process.cwd(), localDataDirName);
  if (fs.existsSync(localDir)) {
    assertDirectoryExists(localDir, "Local rolly-data directory");
    return { kind: "local", dir: localDir };
  }

  const exampleDir = getExampleRollyDataDir();
  assertDirectoryExists(exampleDir, "Example rolly-data directory");
  return { kind: "example", dir: exampleDir };
};

export const getExampleRollyDataDir = (): string => {
  return path.resolve(process.cwd(), ...exampleDataDirSegments);
};

export const getRollyDataFilePath = (source: RollyDataSource, fileName: string): string => {
  return path.join(source.dir, fileName);
};

export const describeRollyDataSource = (source: RollyDataSource = resolveRollyDataSource()): string => {
  if (source.kind === "env") {
    return `ROLLY_DATA_DIR (${source.dir})`;
  }

  if (source.kind === "local") {
    return `local rolly-data directory (${source.dir})`;
  }

  return `example data directory (${source.dir})`;
};

export const isGitCheckoutDirectory = (directory: string): boolean => {
  return fs.existsSync(path.join(directory, ".git"));
};
