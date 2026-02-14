#!/usr/bin/env node

import { runScenarioCommand, validateScenarioCommand } from "./index.js";

type ParsedArgs = {
  scenarioPath?: string;
  onlyStepId?: string;
  outputDir?: string;
  markdownPath?: string;
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "run") {
    const options = parseArgs(args.slice(1));
    if (!options.scenarioPath) {
      throw new Error("--scenario is required");
    }

    const result = await runScenarioCommand({
      scenarioPath: options.scenarioPath,
      onlyStepId: options.onlyStepId,
      outputDir: options.outputDir,
      markdownPath: options.markdownPath,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (command === "validate") {
    const options = parseArgs(args.slice(1));
    if (!options.scenarioPath) {
      throw new Error("--scenario is required");
    }

    const result = await validateScenarioCommand(options.scenarioPath);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  printUsage();
  process.exit(1);
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--scenario") {
      parsed.scenarioPath = args[i + 1];
      i += 1;
    } else if (arg === "--only") {
      parsed.onlyStepId = args[i + 1];
      i += 1;
    } else if (arg === "--output") {
      parsed.outputDir = args[i + 1];
      i += 1;
    } else if (arg === "--markdown") {
      parsed.markdownPath = args[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  return parsed;
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  automation-scenario run --scenario <path> [--only <step_id>] [--output <dir>] [--markdown <path>]",
      "  automation-scenario validate --scenario <path>",
    ].join("\n"),
  );
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
