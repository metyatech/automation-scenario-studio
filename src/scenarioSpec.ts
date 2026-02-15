import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export type ScenarioTarget = "unity" | "web" | "desktop" | "hybrid";

export type ScenarioVariable = {
  id: string;
  type: string;
  required?: boolean;
  default?: unknown;
  [key: string]: unknown;
};

export type ScenarioStepAction = {
  id: string;
  title: string;
  description?: string;
  kind: "action";
  action: string;
  target?: Record<string, unknown>;
  input?: Record<string, unknown>;
  expect?: Record<string, unknown>;
  timing?: Record<string, unknown>;
  retry?: Record<string, unknown>;
  capture?: Record<string, unknown>;
  annotations?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type ScenarioStepControl = {
  id: string;
  title: string;
  description?: string;
  kind: "control";
  control: string;
  [key: string]: unknown;
};

export type ScenarioStepGroup = {
  id: string;
  title: string;
  description?: string;
  kind: "group";
  steps: ScenarioStep[];
  [key: string]: unknown;
};

export type ScenarioStep =
  | ScenarioStepAction
  | ScenarioStepControl
  | ScenarioStepGroup;

export type AutomationScenario = {
  schema_version: "2.0.0";
  scenario_id: string;
  name: string;
  description?: string;
  target: ScenarioTarget;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  metadata: Record<string, unknown>;
  variables: ScenarioVariable[];
  profiles?: Record<
    string,
    { variables?: Record<string, unknown>; [key: string]: unknown }
  >;
  execution?: Record<string, unknown>;
  recording?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
  steps: ScenarioStep[];
};

export type LoadScenarioOptions = {
  profile?: string;
  variables?: Record<string, unknown>;
};

function sanitizeId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "scenario";
}

function sanitizeStepId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "step";
}

function normalizeTarget(input: unknown): ScenarioTarget {
  const targetRaw = String(input ?? "unity").toLowerCase();
  if (
    targetRaw === "unity" ||
    targetRaw === "web" ||
    targetRaw === "desktop" ||
    targetRaw === "hybrid"
  ) {
    return targetRaw;
  }
  throw new Error(`Unsupported target: ${targetRaw}`);
}

function normalizeActionStep(
  step: Record<string, unknown>,
  index: number,
): ScenarioStepAction {
  const actionRaw = String(step.action ?? "wait_for").trim() || "wait_for";
  return {
    id: sanitizeStepId(String(step.id ?? `step-${index + 1}`)),
    title: String(step.title ?? actionRaw),
    description:
      typeof step.description === "string" ? step.description : undefined,
    kind: "action",
    action: actionRaw,
    target:
      step.target && typeof step.target === "object"
        ? (step.target as Record<string, unknown>)
        : undefined,
    input:
      step.input && typeof step.input === "object"
        ? (step.input as Record<string, unknown>)
        : undefined,
    expect:
      step.expect && typeof step.expect === "object"
        ? (step.expect as Record<string, unknown>)
        : undefined,
    timing:
      step.timing && typeof step.timing === "object"
        ? (step.timing as Record<string, unknown>)
        : undefined,
    retry:
      step.retry && typeof step.retry === "object"
        ? (step.retry as Record<string, unknown>)
        : undefined,
    capture:
      step.capture && typeof step.capture === "object"
        ? (step.capture as Record<string, unknown>)
        : undefined,
    annotations: Array.isArray(step.annotations)
      ? (step.annotations as Array<Record<string, unknown>>)
      : undefined,
  };
}

function normalizeStep(
  step: Record<string, unknown>,
  index: number,
): ScenarioStep {
  const kind = String(step.kind ?? "action").toLowerCase();
  if (kind === "group") {
    const nested = Array.isArray(step.steps) ? step.steps : [];
    const normalizedNested = nested
      .filter(
        (child): child is Record<string, unknown> =>
          Boolean(child) && typeof child === "object",
      )
      .map((child, childIndex) => normalizeStep(child, childIndex));
    return {
      id: sanitizeStepId(String(step.id ?? `group-${index + 1}`)),
      title: String(step.title ?? `group-${index + 1}`),
      description:
        typeof step.description === "string" ? step.description : undefined,
      kind: "group",
      steps: normalizedNested,
    };
  }

  if (kind === "control") {
    const control = String(step.control ?? "").trim();
    return {
      id: sanitizeStepId(String(step.id ?? `control-${index + 1}`)),
      title: String(step.title ?? `control-${index + 1}`),
      description:
        typeof step.description === "string" ? step.description : undefined,
      kind: "control",
      control,
    };
  }

  return normalizeActionStep(step, index);
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
  if (input.schema_version !== "2.0.0") {
    throw new Error(
      `Unsupported schema_version: ${String(input.schema_version)}`,
    );
  }

  const steps = Array.isArray(input.steps) ? input.steps : [];
  const variables = Array.isArray(input.variables) ? input.variables : [];
  const target = normalizeTarget(input.target);

  return {
    schema_version: "2.0.0",
    scenario_id: sanitizeId(
      String(input.scenario_id ?? basename(sourcePath, ".scenario.json")),
    ),
    name: String(input.name ?? "Scenario"),
    description:
      typeof input.description === "string" ? input.description : undefined,
    target,
    created_at:
      typeof input.created_at === "string" ? input.created_at : undefined,
    updated_at:
      typeof input.updated_at === "string" ? input.updated_at : undefined,
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag))
      : undefined,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? (input.metadata as Record<string, unknown>)
        : {},
    variables: variables
      .filter(
        (variable): variable is Record<string, unknown> =>
          Boolean(variable) && typeof variable === "object",
      )
      .map((variable) => ({
        id: String(variable.id ?? ""),
        type: String(variable.type ?? "string"),
        required:
          typeof variable.required === "boolean" ? variable.required : false,
        default: variable.default,
        ...variable,
      })),
    profiles:
      input.profiles && typeof input.profiles === "object"
        ? (input.profiles as Record<
            string,
            { variables?: Record<string, unknown> }
          >)
        : {},
    execution:
      input.execution && typeof input.execution === "object"
        ? (input.execution as Record<string, unknown>)
        : undefined,
    recording:
      input.recording && typeof input.recording === "object"
        ? (input.recording as Record<string, unknown>)
        : undefined,
    outputs:
      input.outputs && typeof input.outputs === "object"
        ? (input.outputs as Record<string, unknown>)
        : undefined,
    extensions:
      input.extensions && typeof input.extensions === "object"
        ? (input.extensions as Record<string, unknown>)
        : undefined,
    steps: steps
      .filter(
        (step): step is Record<string, unknown> =>
          Boolean(step) && typeof step === "object",
      )
      .map((step, index) => normalizeStep(step, index)),
  };
}

export function validateScenario(scenario: AutomationScenario): void {
  if (scenario.schema_version !== "2.0.0") {
    throw new Error(`Unsupported schema_version: ${scenario.schema_version}`);
  }
  if (!scenario.scenario_id) {
    throw new Error("scenario_id is required.");
  }
  if (!scenario.name) {
    throw new Error("name is required.");
  }
  normalizeTarget(scenario.target);
  if (!Array.isArray(scenario.variables)) {
    throw new Error("variables must be an array.");
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    throw new Error("steps must contain at least one step.");
  }
  for (const variable of scenario.variables) {
    if (!variable.id || variable.id.trim() === "") {
      throw new Error("variable id is required.");
    }
    if (!variable.type || variable.type.trim() === "") {
      throw new Error(`variable type is required: ${variable.id}`);
    }
  }
  validateSteps(scenario.steps);
}

function validateSteps(steps: ScenarioStep[]): void {
  for (const step of steps) {
    if (!step.id || step.id.trim() === "") {
      throw new Error("step.id is required.");
    }
    if (!step.title || step.title.trim() === "") {
      throw new Error(`step.title is required: ${step.id}`);
    }
    if (step.kind === "action") {
      if (!step.action || step.action.trim() === "") {
        throw new Error(`step.action is required: ${step.id}`);
      }
      continue;
    }
    if (step.kind === "control") {
      if (!step.control || step.control.trim() === "") {
        throw new Error(`step.control is required: ${step.id}`);
      }
      continue;
    }
    if (!Array.isArray(step.steps) || step.steps.length === 0) {
      throw new Error(`group step must contain nested steps: ${step.id}`);
    }
    validateSteps(step.steps);
  }
}

function resolveVariableValues(
  scenario: AutomationScenario,
  options: LoadScenarioOptions | undefined,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const variable of scenario.variables) {
    if (variable.default !== undefined) {
      defaults[variable.id] = variable.default;
    }
  }

  const profileName = options?.profile?.trim();
  if (profileName) {
    const profile = scenario.profiles?.[profileName];
    if (!profile) {
      throw new Error(`Profile not found: ${profileName}`);
    }
    if (profile.variables && typeof profile.variables === "object") {
      Object.assign(defaults, profile.variables);
    }
  }

  if (options?.variables) {
    Object.assign(defaults, options.variables);
  }

  for (const variable of scenario.variables) {
    if (variable.required && defaults[variable.id] === undefined) {
      throw new Error(`required variable is not resolved: ${variable.id}`);
    }
  }
  return defaults;
}

function interpolateString(
  text: string,
  values: Record<string, unknown>,
): string {
  return text.replaceAll(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key) => {
    if (!(key in values)) {
      return "";
    }
    const value = values[key];
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  });
}

function resolveValue<T>(value: T, values: Record<string, unknown>): T {
  if (typeof value === "string") {
    return interpolateString(value, values) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, values)) as T;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[key] = resolveValue(child, values);
    }
    return result as T;
  }
  return value;
}

function resolveSteps(
  steps: ScenarioStep[],
  values: Record<string, unknown>,
): ScenarioStep[] {
  return steps.map((step) => {
    if (step.kind === "group") {
      return {
        ...step,
        title: interpolateString(step.title, values),
        description: step.description
          ? interpolateString(step.description, values)
          : undefined,
        steps: resolveSteps(step.steps, values),
      };
    }
    if (step.kind === "control") {
      return resolveValue(step, values);
    }
    return {
      ...step,
      title: interpolateString(step.title, values),
      description: step.description
        ? interpolateString(step.description, values)
        : undefined,
      action: interpolateString(step.action, values),
      target: step.target ? resolveValue(step.target, values) : undefined,
      input: step.input ? resolveValue(step.input, values) : undefined,
      expect: step.expect ? resolveValue(step.expect, values) : undefined,
      timing: step.timing ? resolveValue(step.timing, values) : undefined,
      retry: step.retry ? resolveValue(step.retry, values) : undefined,
      capture: step.capture ? resolveValue(step.capture, values) : undefined,
      annotations: step.annotations
        ? resolveValue(step.annotations, values)
        : undefined,
    };
  });
}

export function applyScenarioVariables(
  scenario: AutomationScenario,
  options?: LoadScenarioOptions,
): AutomationScenario {
  const values = resolveVariableValues(scenario, options);
  return {
    ...resolveValue(scenario, values),
    variables: scenario.variables,
    profiles: scenario.profiles,
    steps: resolveSteps(scenario.steps, values),
  };
}

export async function loadScenarioFile(
  path: string,
  options?: LoadScenarioOptions,
): Promise<AutomationScenario> {
  const raw = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  const scenario = normalizeScenario(raw, path);
  validateScenario(scenario);
  return applyScenarioVariables(scenario, options);
}
