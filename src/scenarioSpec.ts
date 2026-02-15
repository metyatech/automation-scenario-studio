import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export type ScenarioTarget = "unity" | "web";
export type ScenarioStep = {
  id: string;
  title: string;
  description?: string;
  action: string;
  params: Record<string, unknown>;
};

export type AutomationScenario = {
  schema_version: "1.0.0";
  scenario_id: string;
  name: string;
  target: ScenarioTarget;
  created_at?: string;
  metadata: Record<string, unknown>;
  steps: ScenarioStep[];
};

function sanitizeId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "scenario";
}

export function normalizeScenario(
  input: Record<string, unknown>,
  sourcePath: string,
): AutomationScenario {
  if (typeof input.schema_version !== "string") {
    throw new Error(
      `schema_version is required for scenario file: ${basename(sourcePath)}`,
    );
  }

  const steps = Array.isArray(input.steps) ? input.steps : [];
  const targetRaw = String(input.target ?? "unity").toLowerCase();
  if (targetRaw !== "web" && targetRaw !== "unity") {
    throw new Error(`Unsupported target: ${targetRaw}`);
  }
  const target: ScenarioTarget = targetRaw;

  return {
    schema_version: "1.0.0",
    scenario_id: sanitizeId(
      String(input.scenario_id ?? basename(sourcePath, ".scenario.json")),
    ),
    name: String(input.name ?? "Scenario"),
    target,
    created_at:
      typeof input.created_at === "string" ? input.created_at : undefined,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? (input.metadata as Record<string, unknown>)
        : {},
    steps: steps
      .filter(
        (step): step is Record<string, unknown> =>
          Boolean(step) && typeof step === "object",
      )
      .map((step, index) => ({
        id: sanitizeId(String(step.id ?? `step-${index + 1}`)),
        title: String(step.title ?? step.action ?? `step-${index + 1}`),
        description:
          typeof step.description === "string" ? step.description : undefined,
        action: String(step.action ?? "wait"),
        params:
          step.params && typeof step.params === "object"
            ? (step.params as Record<string, unknown>)
            : {},
      })),
  };
}

export async function loadScenarioFile(
  path: string,
): Promise<AutomationScenario> {
  const raw = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  const scenario = normalizeScenario(raw, path);
  validateScenario(scenario);
  return scenario;
}

export function validateScenario(scenario: AutomationScenario): void {
  if (scenario.schema_version !== "1.0.0") {
    throw new Error(`Unsupported schema_version: ${scenario.schema_version}`);
  }
  if (!scenario.scenario_id) {
    throw new Error("scenario_id is required.");
  }
  if (!scenario.name) {
    throw new Error("name is required.");
  }
  if (scenario.target !== "unity" && scenario.target !== "web") {
    throw new Error(`Unsupported target: ${scenario.target}`);
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    throw new Error("steps must contain at least one step.");
  }
}
