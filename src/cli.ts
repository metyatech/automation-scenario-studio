#!/usr/bin/env node

import {
  runRobotCommand,
  runScenarioCommand,
  validateScenarioCommand,
} from "./index.js";

type ParsedArgs = {
  scenarioPath?: string;
  suitePath?: string;
  onlyStepId?: string;
  outputDir?: string;
  markdownPath?: string;
  recordVideo?: boolean;
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

  if (command === "run-robot") {
    const options = parseArgs(args.slice(1));
    if (!options.suitePath) {
      throw new Error("--suite is required");
    }

    const result = await runRobotCommand({
      suitePath: options.suitePath,
      outputDir: options.outputDir,
      markdownPath: options.markdownPath,
      recordVideo: options.recordVideo,
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
    } else if (arg === "--suite") {
      parsed.suitePath = args[i + 1];
      i += 1;
    } else if (arg === "--record-video") {
      parsed.recordVideo = parseBooleanArg(args[i + 1]);
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
      "  automation-scenario run-robot --suite <path> [--output <dir>] [--markdown <path>] [--record-video <true|false>]",
      "  automation-scenario validate --scenario <path>",
    ].join("\n"),
  );
}

function parseBooleanArg(value: string | undefined): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
