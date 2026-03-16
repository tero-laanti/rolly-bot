import { spawn } from "node:child_process";
import { isGitCheckoutDirectory, resolveRollyDataSource } from "../../../rolly-data/paths";
import {
  createRunSelfUpdateUseCase,
  type SelfUpdateCommandResult,
  type SelfUpdateCommandStep,
} from "../application/run-self-update/use-case";

const runCommandStep = (step: SelfUpdateCommandStep): Promise<SelfUpdateCommandResult> => {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd ?? process.cwd(),
      env: process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      resolve({ step, code: null, stdout, stderr, error });
    });

    child.on("close", (code) => {
      resolve({ step, code, stdout, stderr });
    });
  });
};

const getRollyDataUpdateStep = (): SelfUpdateCommandStep | null => {
  let source;
  try {
    source = resolveRollyDataSource();
  } catch {
    return null;
  }

  if (source.kind === "example" || !isGitCheckoutDirectory(source.dir)) {
    return null;
  }

  return {
    label: "rolly-data git pull",
    command: "git",
    args: ["pull", "--ff-only"],
    cwd: source.dir,
  };
};

export const createLocalRunSelfUpdateUseCase = (options?: { outputLimit?: number }) => {
  return createRunSelfUpdateUseCase(
    {
      getRollyDataUpdateStep,
      runCommandStep,
    },
    options,
  );
};
