import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { renderMarkdownFromArtifacts } from "@metyatech/automation-scenario-renderer";
import type { RunArtifacts } from "@metyatech/automation-scenario-spec";

export type RunRobotCommandOptions = {
  suitePath: string;
  outputDir?: string;
  markdownPath?: string;
  recordVideo?: boolean;
};

export async function runRobotCommand(
  options: RunRobotCommandOptions,
): Promise<{
  scenarioId: string;
  steps: number;
  videoPath: string | null;
  outputDir: string;
}> {
  const runId = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const outputDir = resolve(options.outputDir ?? join("artifacts", runId));
  const suitePath = resolve(options.suitePath);

  const robotDir = join(outputDir, "robot");
  const videoDir = join(outputDir, "video");
  const screenshotsDir = join(outputDir, "screenshots");
  await mkdir(robotDir, { recursive: true });
  await mkdir(videoDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });

  const recordVideo = options.recordVideo ?? true;
  const rawVideoPath = join(videoDir, `${parse(suitePath).name}-raw.mp4`);
  const recording = recordVideo
    ? startScreenRecording(rawVideoPath)
    : undefined;

  try {
    await runCommand("python", buildRobotCommandArgs(robotDir, suitePath));
  } finally {
    if (recording) {
      await stopScreenRecording(recording);
    }
  }

  const artifactsPath = join(outputDir, "steps.json");
  const converterPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "python",
    "robot_output_to_artifacts.py",
  );

  const converterArgs = buildConverterCommandArgs({
    converterPath,
    outputXmlPath: join(robotDir, "output.xml"),
    outputDir,
    artifactsPath,
    suiteId: parse(suitePath).name,
    videoPath: recordVideo ? rawVideoPath : undefined,
  });

  await runCommand("python", converterArgs);

  const artifacts = JSON.parse(
    await readFile(artifactsPath, "utf8"),
  ) as RunArtifacts;

  const markdownPath = resolve(
    options.markdownPath ?? join(outputDir, `${artifacts.scenarioId}.md`),
  );

  await renderMarkdownFromArtifacts(artifacts, markdownPath);

  return {
    scenarioId: artifacts.scenarioId,
    steps: artifacts.steps.length,
    videoPath: artifacts.videoPath ?? null,
    outputDir,
  };
}

function startScreenRecording(outputPath: string): ChildProcess {
  return spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "gdigrab",
      "-framerate",
      "15",
      "-draw_mouse",
      "1",
      "-i",
      "desktop",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-preset",
      "ultrafast",
      outputPath,
    ],
    {
      stdio: ["pipe", "ignore", "ignore"],
    },
  );
}

export function buildRobotCommandArgs(
  robotDir: string,
  suitePath: string,
): string[] {
  return [
    "-m",
    "robot",
    "--outputdir",
    robotDir,
    "--output",
    "output.xml",
    "--log",
    "NONE",
    "--report",
    "NONE",
    suitePath,
  ];
}

export function buildConverterCommandArgs(options: {
  converterPath: string;
  outputXmlPath: string;
  outputDir: string;
  artifactsPath: string;
  suiteId: string;
  videoPath?: string;
}): string[] {
  const args = [
    options.converterPath,
    "--output-xml",
    options.outputXmlPath,
    "--output-dir",
    options.outputDir,
    "--artifacts-json",
    options.artifactsPath,
    "--suite-id",
    options.suiteId,
  ];

  if (options.videoPath) {
    args.push("--video-path", options.videoPath);
  }

  return args;
}

async function stopScreenRecording(recording: ChildProcess): Promise<void> {
  if (recording.exitCode !== null) {
    return;
  }

  if (recording.stdin) {
    try {
      recording.stdin.write("q\n");
      recording.stdin.end();
    } catch {
      // ignore pipe errors on shutdown
    }
  }

  await waitForExit(recording);
}

async function runCommand(command: string, args: string[]): Promise<void> {
  const child = spawn(command, args, { stdio: "inherit", shell: false });
  await waitForExit(child, `${command} failed`);
}

function waitForExit(child: ChildProcess, errorPrefix?: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${errorPrefix ?? "process failed"} (exit=${code ?? "unknown"})`,
          ),
        );
      }
    });
  });
}
