import { spawn } from "node:child_process";
import { isGitCheckoutDirectory, resolveRollyDataSource } from "./rolly-data/paths";

export type CommandStep = {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
};

export type CommandResult = {
  step: CommandStep;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export const buildUpdateSteps = (options: { install: boolean }): CommandStep[] => {
  const steps: CommandStep[] = [
    {
      label: "git pull",
      command: "git",
      args: ["pull", "--ff-only"],
    },
  ];

  const rollyDataUpdateStep = getRollyDataUpdateStep();
  if (rollyDataUpdateStep) {
    steps.push(rollyDataUpdateStep);
  }

  if (options.install) {
    steps.push({
      label: "npm install",
      command: "npm",
      args: ["install"],
    });
  }

  steps.push({
    label: "npm run build",
    command: "npm",
    args: ["run", "build"],
  });

  steps.push({
    label: "deploy commands",
    command: "node",
    args: ["dist/deploy-commands.js"],
  });

  return steps;
};

export const runCommandStep = (step: CommandStep): Promise<CommandResult> => {
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

export const formatCommandResult = (result: CommandResult): string => {
  const commandLine = `$ ${result.step.command} ${result.step.args.join(" ")}`;
  const lines = [
    result.step.label,
    result.step.cwd ? `${commandLine} (cwd: ${result.step.cwd})` : commandLine,
  ];

  if (result.error) {
    lines.push(`error: ${result.error.message}`);
  }

  const out = result.stdout.trim();
  if (out) {
    lines.push(out);
  }

  const err = result.stderr.trim();
  if (err) {
    lines.push(err);
  }

  lines.push(`exit: ${result.code ?? "error"}`);

  return lines.join("\n");
};

export const truncateCommandOutput = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 20)}\n... (truncated)`;
};

const getRollyDataUpdateStep = (): CommandStep | null => {
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
