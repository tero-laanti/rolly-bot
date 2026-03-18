import { truncateWithSuffix } from "../../../../shared/text";

export type SelfUpdateCommandStep = {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
};

export type SelfUpdateCommandResult = {
  step: SelfUpdateCommandStep;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type RunSelfUpdateResult = {
  success: boolean;
  results: SelfUpdateCommandResult[];
  responseText: string;
};

export const defaultSelfUpdateOutputLimit = 1_800;

type BuildSelfUpdateStepsInput = {
  install: boolean;
  rollyDataUpdateStep?: SelfUpdateCommandStep | null;
};

type RunSelfUpdateDependencies = {
  getRollyDataUpdateStep: () => SelfUpdateCommandStep | null;
  runCommandStep: (step: SelfUpdateCommandStep) => Promise<SelfUpdateCommandResult>;
};

type RunSelfUpdateOptions = {
  outputLimit?: number;
};

type RunSelfUpdateInput = {
  install: boolean;
};

export const buildSelfUpdateSteps = ({
  install,
  rollyDataUpdateStep = null,
}: BuildSelfUpdateStepsInput): SelfUpdateCommandStep[] => {
  const steps: SelfUpdateCommandStep[] = [
    {
      label: "git pull",
      command: "git",
      args: ["pull", "--ff-only"],
    },
  ];

  if (rollyDataUpdateStep) {
    steps.push(rollyDataUpdateStep);
  }

  if (install) {
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

export const formatSelfUpdateCommandResult = (result: SelfUpdateCommandResult): string => {
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

export const truncateSelfUpdateOutput = (text: string, maxLength: number): string => {
  return truncateWithSuffix(text, maxLength, "\n... (truncated)");
};

export const createRunSelfUpdateUseCase = (
  { getRollyDataUpdateStep, runCommandStep }: RunSelfUpdateDependencies,
  { outputLimit = defaultSelfUpdateOutputLimit }: RunSelfUpdateOptions = {},
) => {
  return async ({ install }: RunSelfUpdateInput): Promise<RunSelfUpdateResult> => {
    const steps = buildSelfUpdateSteps({
      install,
      rollyDataUpdateStep: getRollyDataUpdateStep(),
    });
    const results: SelfUpdateCommandResult[] = [];
    let success = true;

    for (const step of steps) {
      const result = await runCommandStep(step);
      results.push(result);
      if (result.code !== 0) {
        success = false;
        break;
      }
    }

    const summary = success ? "Update finished." : "Update failed.";
    const detail = truncateSelfUpdateOutput(
      results.map(formatSelfUpdateCommandResult).join("\n\n"),
      outputLimit,
    );

    return {
      success,
      results,
      responseText: detail ? `${summary}\n\n\`\`\`\n${detail}\n\`\`\`` : summary,
    };
  };
};
