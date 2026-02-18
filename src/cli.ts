#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runScenarioCommand } from "./index.js";

type ParsedArgs = {
  scenarioPath?: string;
  outputDir?: string;
  markdownPath?: string;
  recordVideo?: boolean;
  profile?: string;
  variables: Record<string, string>;
};

function getVersion(): string {
  const packageJsonPath = resolve(
    fileURLToPath(import.meta.url),
    "../../package.json",
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  return packageJson.version;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-V")) {
    process.stdout.write(`${getVersion()}\n`);
    process.exit(0);
  }

  const command = args[0];

  if (command === "run-scenario") {
    const options = parseArgs(args.slice(1));
    if (!options.scenarioPath) {
      throw new Error("--scenario is required");
    }

    const result = await runScenarioCommand({
      scenarioPath: options.scenarioPath,
      outputDir: options.outputDir,
      markdownPath: options.markdownPath,
      recordVideo: options.recordVideo,
      profile: options.profile,
      variables: options.variables,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  printUsage();
  process.exit(1);
}

export function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { variables: {} };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--output") {
      parsed.outputDir = args[i + 1];
      i += 1;
    } else if (arg === "--markdown") {
      parsed.markdownPath = args[i + 1];
      i += 1;
    } else if (arg === "--scenario") {
      parsed.scenarioPath = args[i + 1];
      i += 1;
    } else if (arg === "--record-video") {
      parsed.recordVideo = parseBooleanArg(args[i + 1]);
      i += 1;
    } else if (arg === "--profile") {
      parsed.profile = args[i + 1];
      i += 1;
    } else if (arg === "--var") {
      const [key, value] = parseVariableArg(args[i + 1]);
      parsed.variables[key] = value;
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
      "Usage: automation-scenario [command] [options]",
      "",
      "Commands:",
      "  run-scenario    Run an automation scenario",
      "",
      "Options:",
      "  -h, --help      Show this help message",
      "  -V, --version   Show version number",
      "",
      "run-scenario options:",
      "  --scenario <path>        Path to the scenario JSON file (required)",
      "  --output <dir>           Output directory for artifacts",
      "  --markdown <path>        Path for the markdown output",
      "  --record-video <bool>    Whether to record video (true|false)",
      "  --profile <name>         Profile name to use",
      "  --var <key=value>        Variable override (can be repeated)",
      "",
      "Examples:",
      "  automation-scenario run-scenario --scenario ./tests/example.json --output ./out",
      "  automation-scenario run-scenario --scenario ./tests/example.json --profile ci --var env=prod",
    ].join("\n") + "\n",
  );
}

export function parseBooleanArg(value: string | undefined): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

export function parseVariableArg(value: string | undefined): [string, string] {
  if (!value) {
    throw new Error("Invalid --var value: undefined");
  }
  const delimiterIndex = value.indexOf("=");
  if (delimiterIndex <= 0 || delimiterIndex === value.length - 1) {
    throw new Error(`Invalid --var value: ${value}`);
  }
  const key = value.slice(0, delimiterIndex).trim();
  const variableValue = value.slice(delimiterIndex + 1).trim();
  if (key === "" || variableValue === "") {
    throw new Error(`Invalid --var value: ${value}`);
  }
  return [key, variableValue];
}

function isCliEntryPoint(): boolean {
  const argvPath = process.argv[1];
  if (!argvPath) {
    return false;
  }
  return resolve(argvPath) === resolve(fileURLToPath(import.meta.url));
}

if (isCliEntryPoint()) {
  void main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
