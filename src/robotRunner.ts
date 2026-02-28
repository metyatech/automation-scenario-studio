import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  annotateImage,
  annotateVideo,
  renderMarkdownFromArtifacts
} from "@metyatech/automation-scenario-renderer";
import type { AnnotationSpec, RunArtifacts, StepArtifact, VideoTimelineEvent } from "./types.js";
import { loadScenarioFile } from "./scenarioSpec.js";
import { generateRobotSuiteFromScenario } from "./scenarioToRobot.js";

type RendererAnnotationSpec = Parameters<typeof annotateImage>[1];
type RendererVideoTimelineEvent = Parameters<typeof annotateVideo>[2][number];
type RendererRunArtifacts = Parameters<typeof renderMarkdownFromArtifacts>[0];
type RendererStepArtifact = RendererRunArtifacts["steps"][number];

export type RunRobotCommandOptions = {
  suitePath: string;
  outputDir?: string;
  markdownPath?: string;
  recordVideo?: boolean;
};

export type RunScenarioCommandOptions = {
  scenarioPath: string;
  outputDir?: string;
  markdownPath?: string;
  recordVideo?: boolean;
  profile?: string;
  variables?: Record<string, unknown>;
};

export async function runScenarioCommand(options: RunScenarioCommandOptions): Promise<{
  scenarioId: string;
  steps: number;
  videoPath: string | null;
  outputDir: string;
}> {
  const scenarioPath = resolve(options.scenarioPath);
  const scenario = await loadScenarioFile(scenarioPath, {
    profile: options.profile,
    variables: options.variables
  });
  const outputDir = resolve(options.outputDir ?? join("artifacts", scenario.scenario_id));
  const generatedSuiteDir = join(outputDir, "generated");
  const generatedSuitePath = join(generatedSuiteDir, `${scenario.scenario_id}.robot`);

  await mkdir(generatedSuiteDir, { recursive: true });
  await writeFile(generatedSuitePath, generateRobotSuiteFromScenario(scenario), "utf8");

  return runRobotCommand({
    suitePath: generatedSuitePath,
    outputDir,
    markdownPath: options.markdownPath,
    recordVideo: options.recordVideo
  });
}

export async function runRobotCommand(options: RunRobotCommandOptions): Promise<{
  scenarioId: string;
  steps: number;
  videoPath: string | null;
  outputDir: string;
}> {
  const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
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
  const recording = recordVideo ? startScreenRecording(rawVideoPath) : undefined;

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
    "robot_output_to_artifacts.py"
  );

  const converterArgs = buildConverterCommandArgs({
    converterPath,
    outputXmlPath: join(robotDir, "output.xml"),
    outputDir,
    artifactsPath,
    suiteId: parse(suitePath).name,
    videoPath: recordVideo ? rawVideoPath : undefined
  });

  await runCommand("python", converterArgs);

  const artifacts = JSON.parse(await readFile(artifactsPath, "utf8")) as RunArtifacts & {
    annotationsApplied?: boolean;
  };

  if (!artifacts.annotationsApplied) {
    await annotateStepImages(artifacts.steps);
    artifacts.videoPath = await annotateStepVideo(artifacts, outputDir);
  }

  const markdownPath = resolve(
    options.markdownPath ?? join(outputDir, `${artifacts.scenarioId}.md`)
  );

  await renderMarkdownFromArtifacts(toRendererRunArtifacts(artifacts), markdownPath);

  return {
    scenarioId: artifacts.scenarioId,
    steps: artifacts.steps.length,
    videoPath: artifacts.videoPath ?? null,
    outputDir
  };
}

async function annotateStepImages(steps: StepArtifact[]): Promise<void> {
  for (const step of steps) {
    for (const annotation of stepAnnotations(step)) {
      if (!isDrawableAnnotation(annotation)) {
        continue;
      }

      const rendererAnnotation = toRendererAnnotation(annotation);
      if (!rendererAnnotation) {
        continue;
      }

      await annotateImage(step.imagePath, rendererAnnotation);
    }
  }
}

async function annotateStepVideo(
  artifacts: RunArtifacts,
  outputDir: string
): Promise<string | undefined> {
  if (!artifacts.rawVideoPath) {
    return artifacts.videoPath;
  }

  const events = toTimelineEvents(artifacts.steps);
  const rendererEvents = toRendererTimelineEvents(events);
  if (rendererEvents.length === 0) {
    return artifacts.videoPath ?? artifacts.rawVideoPath;
  }

  const annotatedPath = join(outputDir, "video", `${artifacts.scenarioId}-annotated.mp4`);
  await annotateVideo(artifacts.rawVideoPath, annotatedPath, rendererEvents);
  return annotatedPath;
}

export function toTimelineEvents(steps: StepArtifact[]): VideoTimelineEvent[] {
  const firstStartedAtMs = steps
    .map((step) => step.startedAtMs)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b)[0];

  if (typeof firstStartedAtMs !== "number") {
    return [];
  }

  const events: VideoTimelineEvent[] = [];
  for (const step of steps) {
    for (const annotation of stepAnnotations(step)) {
      const event = toTimelineEvent(step, annotation, firstStartedAtMs);
      if (event) {
        events.push(event);
      }
    }
  }
  return events;
}

function toTimelineEvent(
  step: StepArtifact,
  annotation: AnnotationSpec,
  runStartMs: number
): VideoTimelineEvent | undefined {
  if (
    !isDrawableAnnotation(annotation) ||
    typeof step.startedAtMs !== "number" ||
    typeof step.endedAtMs !== "number"
  ) {
    return undefined;
  }

  const startSeconds = toSeconds(step.startedAtMs - runStartMs);
  const endSeconds = toSeconds(
    Math.max(step.endedAtMs - runStartMs, step.startedAtMs - runStartMs + 1000)
  );

  if (
    annotation.type === "click" ||
    annotation.type === "click_pulse" ||
    annotation.type === "highlight_box"
  ) {
    return {
      type: annotation.type,
      startSeconds,
      endSeconds,
      box: annotation.box
    };
  }

  if (annotation.type === "dragDrop" || annotation.type === "drag_arrow") {
    return {
      type: annotation.type,
      startSeconds,
      endSeconds,
      from: annotation.from,
      to: annotation.to
    };
  }

  if (annotation.type === "label") {
    return {
      type: "label",
      startSeconds,
      endSeconds,
      text: annotation.text,
      point: annotation.point,
      box: annotation.box
    };
  }

  return undefined;
}

export function isDrawableAnnotation(annotation: AnnotationSpec | undefined): annotation is Extract<
  AnnotationSpec,
  {
    type: "click" | "click_pulse" | "highlight_box" | "dragDrop" | "drag_arrow" | "label";
  }
> {
  if (!annotation) {
    return false;
  }

  if (
    annotation.type === "click" ||
    annotation.type === "click_pulse" ||
    annotation.type === "highlight_box"
  ) {
    return hasBox(annotation.box);
  }

  if (annotation.type === "dragDrop" || annotation.type === "drag_arrow") {
    return hasPoint(annotation.from) && hasPoint(annotation.to);
  }

  if (annotation.type === "label") {
    if (typeof annotation.text !== "string" || annotation.text.trim() === "") {
      return false;
    }
    if (annotation.point !== undefined && !hasPoint(annotation.point)) {
      return false;
    }
    if (annotation.box !== undefined && !hasBox(annotation.box)) {
      return false;
    }
    return true;
  }

  return false;
}

function stepAnnotations(step: StepArtifact): AnnotationSpec[] {
  const annotations: AnnotationSpec[] = [];
  if (Array.isArray(step.annotations)) {
    annotations.push(...step.annotations);
  }
  if (step.annotation) {
    annotations.push(step.annotation);
  }
  return annotations;
}

function toRendererAnnotation(
  annotation: Extract<
    AnnotationSpec,
    {
      type: "click" | "click_pulse" | "highlight_box" | "dragDrop" | "drag_arrow" | "label";
    }
  >
): RendererAnnotationSpec | undefined {
  if (
    annotation.type === "click" ||
    annotation.type === "click_pulse" ||
    annotation.type === "highlight_box"
  ) {
    return {
      type: annotation.type,
      box: annotation.box
    };
  }

  if (annotation.type === "dragDrop" || annotation.type === "drag_arrow") {
    return {
      type: "dragDrop",
      from: annotation.from,
      to: annotation.to
    };
  }

  if (annotation.type === "label") {
    return {
      type: "label",
      text: annotation.text,
      point: annotation.point,
      box: annotation.box
    };
  }

  return undefined;
}

function toRendererTimelineEvents(events: VideoTimelineEvent[]): RendererVideoTimelineEvent[] {
  return events
    .map((event) => toRendererTimelineEvent(event))
    .filter((event): event is RendererVideoTimelineEvent => event !== undefined);
}

function toRendererTimelineEvent(
  event: VideoTimelineEvent
): RendererVideoTimelineEvent | undefined {
  if (event.type === "click" || event.type === "click_pulse" || event.type === "highlight_box") {
    return {
      type: event.type,
      startSeconds: event.startSeconds,
      endSeconds: event.endSeconds,
      box: event.box
    };
  }

  if (event.type === "dragDrop" || event.type === "drag_arrow") {
    return {
      type: "dragDrop",
      startSeconds: event.startSeconds,
      endSeconds: event.endSeconds,
      from: event.from,
      to: event.to
    };
  }

  if (event.type === "label") {
    return {
      type: "label",
      startSeconds: event.startSeconds,
      endSeconds: event.endSeconds,
      text: event.text,
      point: event.point,
      box: event.box
    };
  }

  return undefined;
}

function toRendererRunArtifacts(artifacts: RunArtifacts): RendererRunArtifacts {
  return {
    scenarioId: artifacts.scenarioId,
    title: artifacts.title,
    steps: artifacts.steps.map((step) => toRendererStepArtifact(step)),
    videoPath: artifacts.videoPath,
    rawVideoPath: artifacts.rawVideoPath
  };
}

function toRendererStepArtifact(step: StepArtifact): RendererStepArtifact {
  const rendererStep: RendererStepArtifact = {
    id: step.id,
    title: step.title,
    imagePath: step.imagePath
  };

  if (step.description) {
    rendererStep.description = step.description;
  }
  if (typeof step.startedAtMs === "number") {
    rendererStep.startedAtMs = step.startedAtMs;
  }
  if (typeof step.endedAtMs === "number") {
    rendererStep.endedAtMs = step.endedAtMs;
  }

  const firstDrawable = stepAnnotations(step).find((annotation) =>
    isDrawableAnnotation(annotation)
  );
  if (firstDrawable) {
    const rendererAnnotation = toRendererAnnotation(firstDrawable);
    if (rendererAnnotation) {
      rendererStep.annotation = rendererAnnotation;
    }
  }

  return rendererStep;
}

function hasBox(value: unknown): value is {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!value || typeof value !== "object") {
    return false;
  }
  const box = value as Record<string, unknown>;
  return (
    typeof box.x === "number" &&
    Number.isFinite(box.x) &&
    typeof box.y === "number" &&
    Number.isFinite(box.y) &&
    typeof box.width === "number" &&
    Number.isFinite(box.width) &&
    typeof box.height === "number" &&
    Number.isFinite(box.height)
  );
}

function hasPoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const point = value as Record<string, unknown>;
  return (
    typeof point.x === "number" &&
    Number.isFinite(point.x) &&
    typeof point.y === "number" &&
    Number.isFinite(point.y)
  );
}

function toSeconds(milliseconds: number): number {
  return Number((milliseconds / 1000).toFixed(2));
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
      outputPath
    ],
    {
      stdio: ["pipe", "ignore", "ignore"]
    }
  );
}

export function buildRobotCommandArgs(robotDir: string, suitePath: string): string[] {
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
    suitePath
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
    options.suiteId
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
        reject(new Error(`${errorPrefix ?? "process failed"} (exit=${code ?? "unknown"})`));
      }
    });
  });
}
