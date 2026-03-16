import { execFileSync } from "node:child_process";

const runGit = (args) => execFileSync("git", args, { stdio: "inherit" });

try {
  runGit(["rev-parse", "--show-toplevel"]);
  runGit(["config", "core.hooksPath", ".githooks"]);
  console.log("Configured git hooks to use .githooks");
} catch (error) {
  console.error("Failed to configure git hooks.");
  process.exit(error.status ?? 1);
}
