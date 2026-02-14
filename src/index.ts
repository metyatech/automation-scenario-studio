import { resolve } from "node:path";

import { renderMarkdownFromArtifacts } from "@metyatech/automation-scenario-renderer";
import {
  filterSteps,
  loadScenario,
  runScenario,
} from "@metyatech/automation-scenario-runtime";

export type RunCommandOptions = {
  scenarioPath: string;
  onlyStepId?: string;
  outputDir?: string;
  markdownPath?: string;
};

export async function runScenarioCommand(options: RunCommandOptions): Promise<{
  scenarioId: string;
  steps: number;
  videoPath: string | null;
  outputDir: string;
}> {
  const scenarioPath = resolve(options.scenarioPath);
  const loaded = await loadScenario(scenarioPath);
  const scenario = filterSteps(loaded, options.onlyStepId);

  const result = await runScenario({
    scenarioPath,
    onlyStepId: options.onlyStepId,
    outputDir: options.outputDir,
  });

  const markdownPath = resolve(
    options.markdownPath ??
      scenario.output?.markdown ??
      `${result.outputDir}/${scenario.id}.md`,
  );

  await renderMarkdownFromArtifacts(result, markdownPath);

  return {
    scenarioId: result.scenarioId,
    steps: result.steps.length,
    videoPath: result.videoPath ?? null,
    outputDir: result.outputDir,
  };
}

export async function validateScenarioCommand(
  scenarioPath: string,
): Promise<{ scenarioId: string; steps: number }> {
  const scenario = await loadScenario(resolve(scenarioPath));
  return {
    scenarioId: scenario.id,
    steps: scenario.steps.length,
  };
}
