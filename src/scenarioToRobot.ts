import type {
  AutomationScenario,
  ScenarioStep,
  ScenarioStepAction,
  ScenarioStepControl
} from "./scenarioSpec.js";

const WEB_ACTIONS = new Set([
  "open_url",
  "click",
  "double_click",
  "right_click",
  "drag_drop",
  "type_text",
  "wait_for",
  "assert",
  "press_keys",
  "screenshot",
  "start_video",
  "stop_video",
  "emit_annotation"
]);

const UNITY_ACTIONS = new Set([
  "click",
  "double_click",
  "right_click",
  "drag_drop",
  "type_text",
  "wait_for",
  "assert",
  "press_keys",
  "open_menu",
  "select_hierarchy",
  "screenshot",
  "start_video",
  "stop_video",
  "emit_annotation"
]);

type ControlSignal = "none" | "break" | "continue" | "return";

type ExpansionFrame = {
  signal: ControlSignal;
};

export function generateRobotSuiteFromScenario(scenario: AutomationScenario): string {
  if (scenario.target === "web") {
    return generateWebRobotSuite(scenario);
  }
  if (scenario.target === "unity") {
    return generateUnityRobotSuite(scenario);
  }

  throw new Error(`Unsupported scenario target: ${scenario.target}`);
}

function generateWebRobotSuite(scenario: AutomationScenario): string {
  const startUrl = toRobotCell(readStartUrl(scenario));
  const browser = toRobotCell(readBrowser(scenario));
  const screenshotEnabled = readScreenshotOutputEnabled(scenario) ? "${TRUE}" : "${FALSE}";
  const stepLines = flattenSteps(scenario.steps).flatMap((step) => toWebStepLines(step));

  return [
    "*** Settings ***",
    "Library    Collections",
    "Library    SeleniumLibrary",
    "Library    Screenshot",
    "Library    OperatingSystem",
    "",
    "*** Test Cases ***",
    toRobotCell(scenario.name),
    "    Ensure Artifact Directories",
    `    \${start_url}=    Set Variable    ${startUrl}`,
    `    \${browser}=    Set Variable    ${browser}`,
    `    \${screenshot_enabled}=    Set Variable    ${screenshotEnabled}`,
    "    Open Browser    ${start_url}    ${browser}",
    "    Maximize Browser Window",
    "    TRY",
    ...stepLines,
    "    FINALLY",
    "        Close All Browsers",
    "    END",
    "",
    ...commonKeywordLines(),
    ...webKeywordLines(),
    ""
  ].join("\n");
}

function generateUnityRobotSuite(scenario: AutomationScenario): string {
  const unityMode = normalizeUnityMode(readUnityExecutionMode(scenario));
  const unityProjectPath = toRobotOptionalCell(readUnityProjectPath(scenario));
  const unityWindowHint = toRobotCell(readUnityWindowHint(scenario));
  const screenshotEnabled = readScreenshotOutputEnabled(scenario) ? "${TRUE}" : "${FALSE}";
  const stepLines = flattenSteps(scenario.steps).flatMap((step) => toUnityStepLines(step));

  return [
    "*** Settings ***",
    "Library    Collections",
    "Library    Screenshot",
    "Library    OperatingSystem",
    "Library    robotframework_unity_editor.UnityEditorLibrary",
    "",
    "*** Test Cases ***",
    toRobotCell(scenario.name),
    "    Ensure Artifact Directories",
    "    Set Unity Output Directory    ${OUTPUT DIR}",
    `    \${unity_mode}=    Set Variable    ${unityMode}`,
    `    \${unity_project_path}=    Set Variable    ${unityProjectPath}`,
    `    \${unity_window_hint}=    Set Variable    ${unityWindowHint}`,
    `    \${screenshot_enabled}=    Set Variable    ${screenshotEnabled}`,
    "    TRY",
    "        IF    '${unity_mode}' == 'launch'",
    "            Require Unity Project Path    ${unity_project_path}",
    "            Start Unity Editor    project_path=${unity_project_path}",
    "        ELSE",
    "            Attach To Running Unity Editor    window_hint=${unity_window_hint}",
    "        END",
    ...stepLines,
    "    FINALLY",
    "        IF    '${unity_mode}' == 'launch'",
    "            Stop Unity Editor",
    "        END",
    "    END",
    "",
    ...commonKeywordLines(),
    ...unityKeywordLines(),
    ""
  ].join("\n");
}

function flattenSteps(steps: ScenarioStep[]): ScenarioStepAction[] {
  const frame: ExpansionFrame = { signal: "none" };
  const expanded = expandSteps(steps, [], {}, frame);
  return dedupeStepIds(expanded);
}

function expandSteps(
  steps: ScenarioStep[],
  parentTitles: string[],
  values: Record<string, unknown>,
  frame: ExpansionFrame
): ScenarioStepAction[] {
  const output: ScenarioStepAction[] = [];

  for (const step of steps) {
    if (frame.signal === "return") {
      break;
    }

    if (step.kind === "group") {
      output.push(
        ...expandSteps(
          step.steps,
          [...parentTitles, interpolateString(step.title, values)],
          values,
          frame
        )
      );
      continue;
    }

    if (step.kind === "action") {
      output.push(resolveActionStep(step, parentTitles, values));
      continue;
    }

    output.push(...expandControlStep(step, parentTitles, values, frame));
  }

  return output;
}

function resolveActionStep(
  step: ScenarioStepAction,
  parentTitles: string[],
  values: Record<string, unknown>
): ScenarioStepAction {
  const resolved = resolveTemplate(step, values) as ScenarioStepAction;
  const titlePrefix = parentTitles.length > 0 ? `${parentTitles.join(" > ")} > ` : "";
  return {
    ...resolved,
    id: sanitizeDynamicStepId(String(resolved.id ?? step.id)),
    title: `${titlePrefix}${String(resolved.title ?? step.title)}`,
    description: typeof resolved.description === "string" ? resolved.description : undefined,
    action: String(resolved.action ?? step.action)
  };
}

function expandControlStep(
  step: ScenarioStepControl,
  parentTitles: string[],
  values: Record<string, unknown>,
  frame: ExpansionFrame
): ScenarioStepAction[] {
  const output: ScenarioStepAction[] = [];

  if (step.control === "if") {
    const branches = Array.isArray(step.branches) ? step.branches : [];
    let matched = false;
    for (const branch of branches) {
      if (!evaluateControlExpression(branch.when, values)) {
        continue;
      }
      matched = true;
      output.push(...expandSteps(branch.steps, parentTitles, values, frame));
      break;
    }
    if (!matched && step.steps) {
      output.push(...expandSteps(step.steps, parentTitles, values, frame));
    }
    return output;
  }

  if (step.control === "for_each") {
    const itemVariable = step.item_variable?.trim() || "item";
    const items = evaluateItemsExpression(step.items_expression, values);
    const nested = step.steps ?? [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const loopValues = {
        ...values,
        [itemVariable]: item,
        [`${itemVariable}_index`]: index,
        item,
        index
      };
      output.push(...expandSteps(nested, parentTitles, loopValues, frame));
      if (frame.signal === "return") {
        return output;
      }
      if (frame.signal === "break") {
        frame.signal = "none";
        break;
      }
      if (frame.signal === "continue") {
        frame.signal = "none";
      }
    }
    return output;
  }

  if (step.control === "while") {
    const nested = step.steps ?? [];
    const maxIterations =
      typeof step.max_iterations === "number" && Number.isInteger(step.max_iterations)
        ? Math.max(1, step.max_iterations)
        : 50;

    let iterations = 0;
    while (iterations < maxIterations) {
      if (!evaluateControlExpression(step.expression, values)) {
        break;
      }
      const loopValues = {
        ...values,
        loop_index: iterations
      };
      output.push(...expandSteps(nested, parentTitles, loopValues, frame));
      iterations += 1;

      if (frame.signal === "return") {
        return output;
      }
      if (frame.signal === "break") {
        frame.signal = "none";
        break;
      }
      if (frame.signal === "continue") {
        frame.signal = "none";
      }
    }
    return output;
  }

  if (step.control === "try") {
    if (step.steps) {
      output.push(...expandSteps(step.steps, parentTitles, values, frame));
    }
    if (step.finally_steps) {
      output.push(...expandSteps(step.finally_steps, parentTitles, values, frame));
    }
    return output;
  }

  if (step.control === "parallel") {
    if (step.steps) {
      output.push(...expandSteps(step.steps, parentTitles, values, frame));
    }
    return output;
  }

  if (step.control === "break") {
    frame.signal = "break";
    return output;
  }

  if (step.control === "continue") {
    frame.signal = "continue";
    return output;
  }

  if (step.control === "return") {
    frame.signal = "return";
    return output;
  }

  throw new Error(`Unsupported control step: ${step.control} (${step.id})`);
}

function evaluateItemsExpression(
  expression: string | undefined,
  values: Record<string, unknown>
): unknown[] {
  if (!expression || expression.trim() === "") {
    return [];
  }

  const resolved = resolveExpressionValue(expression, values);
  if (Array.isArray(resolved)) {
    return resolved;
  }
  if (resolved && typeof resolved === "object") {
    return Object.values(resolved);
  }
  if (typeof resolved === "string") {
    const trimmed = resolved.trim();
    if (trimmed === "") {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // non-json list expression
    }
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
  }
  if (resolved === undefined || resolved === null) {
    return [];
  }
  return [resolved];
}
function evaluateControlExpression(
  expression: string | undefined,
  values: Record<string, unknown>
): boolean {
  if (!expression) {
    return false;
  }
  const normalized = expression.trim();
  if (normalized === "") {
    return false;
  }
  if (normalized.startsWith("!")) {
    return !evaluateControlExpression(normalized.slice(1), values);
  }

  const operatorMatch = normalized.match(/^(.*?)\s+(==|!=|>=|<=|>|<|in|contains)\s+(.*?)$/);
  if (!operatorMatch) {
    return isTruthy(resolveExpressionValue(normalized, values));
  }

  const left = resolveExpressionValue(operatorMatch[1], values);
  const operator = operatorMatch[2];
  const right = resolveExpressionValue(operatorMatch[3], values);

  if (operator === "==") {
    return compareOperands(left, right) === 0;
  }
  if (operator === "!=") {
    return compareOperands(left, right) !== 0;
  }
  if (operator === ">") {
    return compareOperands(left, right) > 0;
  }
  if (operator === "<") {
    return compareOperands(left, right) < 0;
  }
  if (operator === ">=") {
    return compareOperands(left, right) >= 0;
  }
  if (operator === "<=") {
    return compareOperands(left, right) <= 0;
  }
  if (operator === "in") {
    if (Array.isArray(right)) {
      return right.some((item) => compareOperands(left, item) === 0);
    }
    if (typeof right === "string") {
      return right.includes(String(left ?? ""));
    }
    return false;
  }
  if (operator === "contains") {
    if (Array.isArray(left)) {
      return left.some((item) => compareOperands(item, right) === 0);
    }
    if (typeof left === "string") {
      return left.includes(String(right ?? ""));
    }
    return false;
  }

  return false;
}

function resolveExpressionValue(raw: string, values: Record<string, unknown>): unknown {
  const token = raw.trim();
  if (token === "") {
    return "";
  }

  if (token.startsWith("${") && token.endsWith("}")) {
    const path = token.slice(2, -1).trim();
    return getPathValue(values, path);
  }

  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }

  if (token === "true") {
    return true;
  }
  if (token === "false") {
    return false;
  }
  if (token === "null") {
    return null;
  }

  const maybeNumber = Number(token);
  if (!Number.isNaN(maybeNumber) && token !== "") {
    return maybeNumber;
  }

  if (token.startsWith("{") || token.startsWith("[")) {
    try {
      return JSON.parse(token) as unknown;
    } catch {
      // keep as raw token
    }
  }

  if (token.includes("${")) {
    return interpolateString(token, values);
  }

  const pathValue = getPathValue(values, token);
  if (pathValue !== undefined) {
    return pathValue;
  }

  return token;
}

function getPathValue(source: Record<string, unknown>, path: string): unknown {
  const normalized = path.trim();
  if (normalized === "") {
    return undefined;
  }
  const segments = normalized.split(".").filter((segment) => segment !== "");
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    if (!(segment in record)) {
      return undefined;
    }
    current = record[segment];
  }
  return current;
}

function compareOperands(left: unknown, right: unknown): number {
  const leftNumber = toFiniteNumber(left);
  const rightNumber = toFiniteNumber(right);
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
  }
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  return leftText === rightText ? 0 : leftText > rightText ? 1 : -1;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "false" && normalized !== "0";
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

function dedupeStepIds(steps: ScenarioStepAction[]): ScenarioStepAction[] {
  const seen = new Map<string, number>();
  return steps.map((step) => {
    const baseId = sanitizeDynamicStepId(step.id);
    const next = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, next);
    if (next === 1) {
      return {
        ...step,
        id: baseId
      };
    }
    return {
      ...step,
      id: `${baseId}-${next}`
    };
  });
}

function sanitizeDynamicStepId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "step";
}

function toWebStepLines(step: ScenarioStepAction): string[] {
  ensureActionSupported(step, WEB_ACTIONS, "web");
  const id = toRobotCell(step.id);
  const title = toRobotCell(step.title);
  const description = toRobotOptionalCell(step.description ?? "");

  if (step.action === "open_url") {
    const url = requiredStringFromInput(step, "url");
    return withStaticAnnotations(
      [`        Doc Web Step    ${id}    ${title}    ${description}    Go To    ${url}`],
      step
    );
  }
  if (step.action === "click") {
    const locator = resolveWebLocator(step.target);
    return withStaticAnnotations(
      [`        Doc Web Click Step    ${id}    ${title}    ${description}    ${locator}`],
      step
    );
  }
  if (step.action === "double_click") {
    const locator = resolveWebLocator(step.target);
    return withStaticAnnotations(
      [`        Doc Web Double Click Step    ${id}    ${title}    ${description}    ${locator}`],
      step
    );
  }
  if (step.action === "right_click") {
    const locator = resolveWebLocator(step.target);
    return withStaticAnnotations(
      [`        Doc Web Context Click Step    ${id}    ${title}    ${description}    ${locator}`],
      step
    );
  }
  if (step.action === "drag_drop") {
    const sourceLocator = resolveWebLocator(readNestedTarget(step.input, "source"));
    const targetLocator = resolveWebLocator(step.target);
    return withStaticAnnotations(
      [
        `        Doc Web Drag Step    ${id}    ${title}    ${description}    ${sourceLocator}    ${targetLocator}`
      ],
      step
    );
  }
  if (step.action === "type_text") {
    const locator = resolveWebLocator(step.target);
    const text = requiredStringFromInput(step, "text");
    return withStaticAnnotations(
      [
        `        Doc Web Step    ${id}    ${title}    ${description}    Input Text    ${locator}    ${text}`
      ],
      step
    );
  }
  if (step.action === "wait_for") {
    if (step.target) {
      const locator = resolveWebLocator(step.target);
      const timeoutSeconds = readTimingNumber(step, "timeout_seconds", 10);
      return withStaticAnnotations(
        [
          `        Doc Web Step    ${id}    ${title}    ${description}    Wait Until Element Is Visible    ${locator}    ${timeoutSeconds}s`
        ],
        step
      );
    }

    const seconds = numberFromInput(step, "seconds", 1);
    return withStaticAnnotations(
      [`        Doc Web Step    ${id}    ${title}    ${description}    Sleep    ${seconds}`],
      step
    );
  }
  if (step.action === "assert") {
    if (step.target) {
      const locator = resolveWebLocator(step.target);
      return withStaticAnnotations(
        [`        Doc Web Assert Step    ${id}    ${title}    ${description}    ${locator}`],
        step
      );
    }

    const text = readStringFromInput(step, "text");
    if (text !== "") {
      return withStaticAnnotations(
        [
          `        Doc Web Step    ${id}    ${title}    ${description}    Page Should Contain    ${toRobotCell(text)}`
        ],
        step
      );
    }

    throw new Error(`Step "${step.id}" assert requires target or input.text.`);
  }
  if (step.action === "press_keys") {
    const shortcut = readStringFromInput(step, "shortcut");
    const keys = readStringFromInput(step, "keys");
    const value = toRobotCell(shortcut || keys || "{ENTER}");
    return withStaticAnnotations(
      [
        `        Doc Web Step    ${id}    ${title}    ${description}    Press Keys    NONE    ${value}`
      ],
      step
    );
  }
  if (
    step.action === "screenshot" ||
    step.action === "start_video" ||
    step.action === "stop_video" ||
    step.action === "emit_annotation"
  ) {
    return withStaticAnnotations(
      [`        Doc Web Step    ${id}    ${title}    ${description}    No Operation`],
      step
    );
  }

  throw new Error(`Unsupported web action: ${step.action}`);
}

function toUnityStepLines(step: ScenarioStepAction): string[] {
  ensureActionSupported(step, UNITY_ACTIONS, "unity");
  const id = toRobotCell(step.id);
  const title = toRobotCell(step.title);
  const description = toRobotOptionalCell(step.description ?? "");

  if (step.action === "click" || step.action === "double_click" || step.action === "right_click") {
    const candidate = selectTargetCandidate(
      step.target,
      new Set(["unity_hierarchy", "uia", "coordinate"]),
      `${step.action} target`
    );
    const strategy = readTargetStrategy(candidate);

    if (strategy === "unity_hierarchy") {
      const path = readUnityHierarchyPathFromCandidate(candidate);
      return withStaticAnnotations(
        [
          `        \${annotation}=    Wait Until Keyword Succeeds    45 sec    1 sec    Select Unity Hierarchy Object    hierarchy_path=${path}    timeout_seconds=4.0`,
          `        Wait For Seconds    ${waitSecondsFromTiming(step, 0.0)}`,
          `        Save Step Screenshot    ${id}`,
          "        Emit Annotation Metadata    ${annotation}"
        ],
        step
      );
    }

    if (strategy === "uia") {
      const selectorArgs = unitySelectorArgsFromCandidate(candidate);
      const lines: string[] = [];
      if (step.action === "right_click") {
        lines.push(`        \${annotation}=    Click Unity Element${selectorArgs}    button=right`);
      } else {
        lines.push(`        \${annotation}=    Click Unity Element${selectorArgs}`);
        if (step.action === "double_click") {
          lines.push(`        Click Unity Element${selectorArgs}`);
        }
      }
      lines.push(`        Wait For Seconds    ${waitSecondsFromTiming(step, 0.0)}`);
      lines.push(`        Save Step Screenshot    ${id}`);
      lines.push("        Emit Annotation Metadata    ${annotation}");
      return withStaticAnnotations(lines, step);
    }

    const coordinate = requiredCoordinateFromCandidate(candidate);
    const keyword =
      step.action === "double_click"
        ? "Unity Double Click Relative And Emit"
        : step.action === "right_click"
          ? "Unity Right Click Relative And Emit"
          : "Unity Click Relative And Emit";

    return withStaticAnnotations(
      [
        `        Doc Desktop Step    ${id}    ${title}    ${description}    ${keyword}    ${coordinate.xRatio}    ${coordinate.yRatio}    180    48    ${waitSecondsFromTiming(step, 0.8)}`
      ],
      step
    );
  }

  if (step.action === "drag_drop") {
    const source = selectTargetCandidate(
      readNestedTarget(step.input, "source"),
      new Set(["uia", "coordinate"]),
      "drag_drop source"
    );
    const target = selectTargetCandidate(
      step.target,
      new Set(["uia", "coordinate"]),
      "drag_drop target"
    );
    const sourceStrategy = readTargetStrategy(source);
    const targetStrategy = readTargetStrategy(target);

    if (sourceStrategy === "uia" && targetStrategy === "uia") {
      const sourceArgs = unitySelectorArgsFromCandidate(source, "source_");
      const targetArgs = unitySelectorArgsFromCandidate(target, "target_");
      return withStaticAnnotations(
        [
          `        \${annotation}=    Drag Unity Element To Element${sourceArgs}${targetArgs}`,
          `        Wait For Seconds    ${waitSecondsFromTiming(step, 0.0)}`,
          `        Save Step Screenshot    ${id}`,
          "        Emit Annotation Metadata    ${annotation}"
        ],
        step
      );
    }

    if (sourceStrategy === "coordinate" && targetStrategy === "coordinate") {
      const sourceCoordinate = requiredCoordinateFromCandidate(source);
      const targetCoordinate = requiredCoordinateFromCandidate(target);
      return withStaticAnnotations(
        [
          `        Doc Desktop Step    ${id}    ${title}    ${description}    Unity Drag Relative And Emit    ${sourceCoordinate.xRatio}    ${sourceCoordinate.yRatio}    ${targetCoordinate.xRatio}    ${targetCoordinate.yRatio}    ${waitSecondsFromTiming(step, 0.8)}`
        ],
        step
      );
    }

    throw new Error(
      `Unsupported unity drag_drop selector strategy pair: ${sourceStrategy} -> ${targetStrategy}`
    );
  }

  if (step.action === "type_text") {
    const text = requiredStringFromInput(step, "text");
    return withStaticAnnotations(
      [
        `        Doc Desktop Step    ${id}    ${title}    ${description}    Type Unity Text    ${text}`
      ],
      step
    );
  }
  if (step.action === "wait_for") {
    if (step.target) {
      const candidate = selectTargetCandidate(
        step.target,
        new Set(["uia", "unity_hierarchy"]),
        "wait_for target"
      );
      if (readTargetStrategy(candidate) === "uia") {
        const selectorArgs = unitySelectorArgsFromCandidate(candidate);
        const timeoutSeconds = readTimingNumber(step, "timeout_seconds", 10);
        return withStaticAnnotations(
          [
            `        Wait For Unity Element${selectorArgs}    timeout_seconds=${timeoutSeconds}`,
            `        Save Step Screenshot    ${id}`
          ],
          step
        );
      }
      const path = readUnityHierarchyPathFromCandidate(candidate);
      return withStaticAnnotations(
        [
          `        \${annotation}=    Wait Until Keyword Succeeds    45 sec    1 sec    Select Unity Hierarchy Object    hierarchy_path=${path}    timeout_seconds=4.0`,
          `        Save Step Screenshot    ${id}`,
          "        Emit Annotation Metadata    ${annotation}"
        ],
        step
      );
    }

    const seconds = numberFromInput(step, "seconds", 1);
    return withStaticAnnotations(
      [
        `        Doc Desktop Step    ${id}    ${title}    ${description}    Wait For Seconds    ${seconds}`
      ],
      step
    );
  }
  if (step.action === "assert") {
    const candidate = selectTargetCandidate(
      step.target,
      new Set(["uia", "unity_hierarchy"]),
      "assert target"
    );
    if (readTargetStrategy(candidate) === "uia") {
      const selectorArgs = unitySelectorArgsFromCandidate(candidate);
      const timeoutSeconds = readTimingNumber(step, "timeout_seconds", 10);
      return withStaticAnnotations(
        [
          `        Wait For Unity Element${selectorArgs}    timeout_seconds=${timeoutSeconds}`,
          `        Save Step Screenshot    ${id}`
        ],
        step
      );
    }

    const expectedPath = readUnityHierarchyPathFromCandidate(candidate);
    return withStaticAnnotations(
      [
        "        ${selected_hierarchy}=    Get Unity Selected Hierarchy Path",
        `        Should Be Equal As Strings    \${selected_hierarchy}    ${expectedPath}`,
        `        Save Step Screenshot    ${id}`
      ],
      step
    );
  }
  if (step.action === "press_keys") {
    const shortcut = readStringFromInput(step, "shortcut");
    if (shortcut !== "") {
      return withStaticAnnotations(
        [
          `        Doc Desktop Step    ${id}    ${title}    ${description}    Send Unity Shortcut    ${toRobotCell(shortcut)}`
        ],
        step
      );
    }
    const keys = readStringFromInput(step, "keys");
    return withStaticAnnotations(
      [
        `        Doc Desktop Step    ${id}    ${title}    ${description}    Press Unity Keys    ${toRobotCell(keys || "{ENTER}")}`
      ],
      step
    );
  }
  if (step.action === "open_menu") {
    const menuPathCandidates = readStringListFromInput(step, "menu_path_candidates").map(
      (candidate) => toRobotCell(candidate)
    );
    if (menuPathCandidates.length > 0) {
      return withStaticAnnotations(
        [
          `        Doc Desktop Step    ${id}    ${title}    ${description}    Open Unity Top Menu With Fallbacks    ${menuPathCandidates.join("    ")}`
        ],
        step
      );
    }

    const menuPath = requiredStringFromInput(step, "menu_path");
    return withStaticAnnotations(
      [
        `        Doc Desktop Step    ${id}    ${title}    ${description}    Open Unity Top Menu    ${menuPath}`
      ],
      step
    );
  }
  if (step.action === "select_hierarchy") {
    const candidates = selectTargetCandidates(
      step.target,
      new Set(["unity_hierarchy"]),
      "select_hierarchy target"
    );
    const paths = candidates.map((candidate) => readUnityHierarchyPathFromCandidate(candidate));
    const keyword =
      paths.length > 1
        ? `Select Unity Hierarchy Object With Fallbacks    ${paths.join("    ")}`
        : `Select Unity Hierarchy Object    hierarchy_path=${paths[0]}    timeout_seconds=4.0`;

    return withStaticAnnotations(
      [
        `        \${annotation}=    Wait Until Keyword Succeeds    45 sec    1 sec    ${keyword}`,
        `        Save Step Screenshot    ${id}`,
        "        Emit Annotation Metadata    ${annotation}"
      ],
      step
    );
  }
  if (
    step.action === "screenshot" ||
    step.action === "start_video" ||
    step.action === "stop_video" ||
    step.action === "emit_annotation"
  ) {
    return withStaticAnnotations(
      [`        Doc Desktop Step    ${id}    ${title}    ${description}    No Operation`],
      step
    );
  }

  throw new Error(`Unsupported unity action: ${step.action}`);
}

function withStaticAnnotations(lines: string[], step: ScenarioStepAction): string[] {
  const annotationLines = staticAnnotationLines(step);
  if (annotationLines.length === 0) {
    return lines;
  }
  return [...lines, ...annotationLines];
}

function staticAnnotationLines(step: ScenarioStepAction): string[] {
  if (!step.annotations || step.annotations.length === 0) {
    return [];
  }
  const payload = JSON.stringify(step.annotations).replaceAll("'''", "\\u0027\\u0027\\u0027");
  return [
    `        \${annotations}=    Evaluate    json.loads(r'''${payload}''')    modules=json`,
    "        Emit Annotation List Metadata    ${annotations}"
  ];
}

function commonKeywordLines(): string[] {
  return [
    "*** Keywords ***",
    "Ensure Artifact Directories",
    "    Create Directory    ${OUTPUT DIR}${/}screenshots",
    "    Create Directory    ${OUTPUT DIR}${/}robot",
    "",
    "Doc Desktop Step",
    "    [Arguments]    ${id}    ${title}    ${description}    ${keyword}    @{args}",
    "    Ensure Artifact Directories",
    "    Run Keyword    ${keyword}    @{args}",
    "    Save Step Screenshot    ${id}",
    "",
    "Save Step Screenshot",
    "    [Arguments]    ${id}",
    "    IF    not ${screenshot_enabled}",
    "        RETURN",
    "    END",
    "    ${image_path}=    Set Variable    ${OUTPUT DIR}${/}screenshots${/}${id}.png",
    "    Take Screenshot    ${image_path}",
    "",
    "Emit Step Metadata",
    "    [Arguments]    ${metadata}",
    "    ${payload}=    Evaluate    json.dumps($metadata, ensure_ascii=False)    modules=json",
    "    Log    DOCMETA:${payload}",
    "",
    "Emit Annotation Metadata",
    "    [Arguments]    ${annotation}",
    "    ${metadata}=    Create Dictionary    annotation=${annotation}",
    "    Emit Step Metadata    ${metadata}",
    "",
    "Emit Annotation List Metadata",
    "    [Arguments]    ${annotations}",
    "    ${metadata}=    Create Dictionary    annotations=${annotations}",
    "    Emit Step Metadata    ${metadata}",
    "",
    "Require Unity Project Path",
    "    [Arguments]    ${project_path}",
    "    ${normalized}=    Evaluate    str($project_path).strip()",
    "    IF    '${normalized}' == ''",
    "        Fail    unity_project_path is required when unity_execution_mode is launch.",
    "    END",
    ""
  ];
}
function webKeywordLines(): string[] {
  return [
    "Doc Web Step",
    "    [Arguments]    ${id}    ${title}    ${description}    ${keyword}    @{args}",
    "    Ensure Artifact Directories",
    "    Run Keyword    ${keyword}    @{args}",
    "    Save Step Screenshot    ${id}",
    "",
    "Doc Web Click Step",
    "    [Arguments]    ${id}    ${title}    ${description}    ${locator}",
    "    Ensure Artifact Directories",
    "    ${box}=    Get Element Screen Box    ${locator}",
    "    Click Element    ${locator}",
    "    Save Step Screenshot    ${id}",
    "    ${box_dict}=    Create Dictionary    x=${box}[0]    y=${box}[1]    width=${box}[2]    height=${box}[3]",
    "    ${annotation}=    Create Dictionary    type=click    box=${box_dict}",
    "    ${metadata}=    Create Dictionary    annotation=${annotation}",
    "    Emit Step Metadata    ${metadata}",
    "",
    "Doc Web Double Click Step",
    "    [Arguments]    ${id}    ${title}    ${description}    ${locator}",
    "    Ensure Artifact Directories",
    "    ${box}=    Get Element Screen Box    ${locator}",
    "    Double Click Element    ${locator}",
    "    Save Step Screenshot    ${id}",
    "    ${box_dict}=    Create Dictionary    x=${box}[0]    y=${box}[1]    width=${box}[2]    height=${box}[3]",
    "    ${annotation}=    Create Dictionary    type=click_pulse    box=${box_dict}",
    "    ${metadata}=    Create Dictionary    annotation=${annotation}",
    "    Emit Step Metadata    ${metadata}",
    "",
    "Doc Web Context Click Step",
    "    [Arguments]    ${id}    ${title}    ${description}    ${locator}",
    "    Ensure Artifact Directories",
    "    ${box}=    Get Element Screen Box    ${locator}",
    "    Open Context Menu    ${locator}",
    "    Save Step Screenshot    ${id}",
    "    ${box_dict}=    Create Dictionary    x=${box}[0]    y=${box}[1]    width=${box}[2]    height=${box}[3]",
    "    ${annotation}=    Create Dictionary    type=click_pulse    box=${box_dict}",
    "    ${metadata}=    Create Dictionary    annotation=${annotation}",
    "    Emit Step Metadata    ${metadata}",
    "",
    "Doc Web Assert Step",
    "    [Arguments]    ${id}    ${title}    ${description}    ${locator}",
    "    Ensure Artifact Directories",
    "    Wait Until Element Is Visible    ${locator}",
    "    Save Step Screenshot    ${id}",
    "",
    "Doc Web Drag Step",
    "    [Arguments]    ${id}    ${title}    ${description}    ${source_locator}    ${target_locator}",
    "    Ensure Artifact Directories",
    "    ${source}=    Get Element Screen Box    ${source_locator}",
    "    ${target}=    Get Element Screen Box    ${target_locator}",
    "    Drag And Drop    ${source_locator}    ${target_locator}",
    "    Save Step Screenshot    ${id}",
    "    ${from_point}=    Create Dictionary    x=${source}[4]    y=${source}[5]",
    "    ${to_point}=    Create Dictionary    x=${target}[4]    y=${target}[5]",
    "    ${annotation}=    Create Dictionary    type=drag_arrow    from=${from_point}    to=${to_point}",
    "    ${metadata}=    Create Dictionary    annotation=${annotation}",
    "    Emit Step Metadata    ${metadata}",
    "",
    "Get Element Screen Box",
    "    [Arguments]    ${locator}",
    "    ${box}=    Execute JavaScript    const locator = arguments[0]; let el = null; if (locator.startsWith('css:')) { el = document.querySelector(locator.slice(4)); } else if (locator.startsWith('xpath:')) { const result = document.evaluate(locator.slice(6), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); el = result.singleNodeValue; } else { el = document.querySelector(locator); } if (!el) { return null; } const rect = el.getBoundingClientRect(); const sx = window.screenX ?? window.screenLeft ?? 0; const sy = window.screenY ?? window.screenTop ?? 0; const viewportX = sx + Math.max(0, (window.outerWidth - window.innerWidth) / 2); const viewportY = sy + Math.max(0, window.outerHeight - window.innerHeight); return [Math.round(viewportX + rect.left), Math.round(viewportY + rect.top), Math.round(rect.width), Math.round(rect.height), Math.round(viewportX + rect.left + rect.width / 2), Math.round(viewportY + rect.top + rect.height / 2)];    ARGUMENTS    ${locator}",
    "    Should Not Be Equal    ${box}    ${None}",
    "    RETURN    ${box}",
    ""
  ];
}

function unityKeywordLines(): string[] {
  return [
    "Open Unity Top Menu With Fallbacks",
    "    [Arguments]    @{menu_paths}",
    "    ${last_error}=    Set Variable    ${EMPTY}",
    "    FOR    ${menu_path}    IN    @{menu_paths}",
    "        ${status}    ${result}=    Run Keyword And Ignore Error    Open Unity Top Menu    ${menu_path}",
    "        IF    '${status}' == 'PASS'",
    "            RETURN",
    "        END",
    "        ${last_error}=    Set Variable    ${result}",
    "    END",
    "    Fail    Failed to open Unity menu using candidates: ${last_error}",
    "",
    "Select Unity Hierarchy Object With Fallbacks",
    "    [Arguments]    @{hierarchy_paths}",
    "    ${last_error}=    Set Variable    ${EMPTY}",
    "    FOR    ${path}    IN    @{hierarchy_paths}",
    "        ${status}    ${result}=    Run Keyword And Ignore Error    Select Unity Hierarchy Object    hierarchy_path=${path}    timeout_seconds=4.0",
    "        IF    '${status}' == 'PASS'",
    "            RETURN    ${result}",
    "        END",
    "        ${last_error}=    Set Variable    ${result}",
    "    END",
    "    Fail    Failed to select Unity hierarchy object using candidates: ${last_error}",
    "",
    "Unity Click Relative And Emit",
    "    [Arguments]    ${x_ratio}    ${y_ratio}    ${box_width}=180    ${box_height}=48    ${wait_seconds}=0.8",
    "    ${annotation}=    Click Unity Relative    ${x_ratio}    ${y_ratio}    box_width=${box_width}    box_height=${box_height}",
    "    Wait For Seconds    ${wait_seconds}",
    "    Emit Annotation Metadata    ${annotation}",
    "",
    "Unity Double Click Relative And Emit",
    "    [Arguments]    ${x_ratio}    ${y_ratio}    ${box_width}=180    ${box_height}=48    ${wait_seconds}=0.8",
    "    ${annotation}=    Double Click Unity Relative    ${x_ratio}    ${y_ratio}    box_width=${box_width}    box_height=${box_height}",
    "    Wait For Seconds    ${wait_seconds}",
    "    Emit Annotation Metadata    ${annotation}",
    "",
    "Unity Right Click Relative And Emit",
    "    [Arguments]    ${x_ratio}    ${y_ratio}    ${box_width}=180    ${box_height}=48    ${wait_seconds}=0.8",
    "    ${annotation}=    Right Click Unity Relative    ${x_ratio}    ${y_ratio}    box_width=${box_width}    box_height=${box_height}",
    "    Wait For Seconds    ${wait_seconds}",
    "    Emit Annotation Metadata    ${annotation}",
    "",
    "Unity Drag Relative And Emit",
    "    [Arguments]    ${from_x_ratio}    ${from_y_ratio}    ${to_x_ratio}    ${to_y_ratio}    ${wait_seconds}=0.8",
    "    ${annotation}=    Drag Unity Relative    ${from_x_ratio}    ${from_y_ratio}    ${to_x_ratio}    ${to_y_ratio}",
    "    Wait For Seconds    ${wait_seconds}",
    "    Emit Annotation Metadata    ${annotation}",
    ""
  ];
}

function ensureActionSupported(
  step: ScenarioStepAction,
  allowed: Set<string>,
  target: "web" | "unity"
): void {
  if (!allowed.has(step.action)) {
    throw new Error(
      `Unsupported action "${step.action}" for target "${target}" at step "${step.id}".`
    );
  }
}

function readStartUrl(scenario: AutomationScenario): string {
  const fromVariable = readVariableDefault(scenario, "start_url");
  if (fromVariable) {
    return fromVariable;
  }
  const fromMetadata = readMetadataString(scenario, "start_url");
  return fromMetadata || "about:blank";
}

function readBrowser(scenario: AutomationScenario): string {
  const fromVariable = readVariableDefault(scenario, "browser");
  if (fromVariable) {
    return fromVariable;
  }
  const fromMetadata = readMetadataString(scenario, "browser");
  return fromMetadata || "chrome";
}

function readUnityExecutionMode(scenario: AutomationScenario): string {
  const executionMode = readExecutionString(scenario, "mode");
  if (executionMode) {
    return executionMode;
  }
  return readMetadataString(scenario, "unity_execution_mode") || "attach";
}

function readUnityProjectPath(scenario: AutomationScenario): string {
  const launch = readExecutionObject(scenario, "launch");
  const variableId =
    launch && typeof launch.unity_project_path_var === "string"
      ? launch.unity_project_path_var
      : "";
  if (variableId) {
    const fromVariable = readVariableDefault(scenario, variableId);
    if (fromVariable) {
      return fromVariable;
    }
  }
  const defaultProject = readVariableDefault(scenario, "unity_project_path");
  if (defaultProject) {
    return defaultProject;
  }
  return readMetadataString(scenario, "unity_project_path") || "";
}

function readUnityWindowHint(scenario: AutomationScenario): string {
  const attach = readExecutionObject(scenario, "attach");
  const variableId =
    attach && typeof attach.window_hint_var === "string" ? attach.window_hint_var : "";
  if (variableId) {
    const fromVariable = readVariableDefault(scenario, variableId);
    if (fromVariable) {
      return fromVariable;
    }
  }
  const defaultHint = readVariableDefault(scenario, "unity_window_hint");
  if (defaultHint) {
    return defaultHint;
  }
  return readMetadataString(scenario, "target_window_hint") || "Unity";
}

function readScreenshotOutputEnabled(scenario: AutomationScenario): boolean {
  const outputs = scenario.outputs;
  if (!outputs || typeof outputs !== "object") {
    return true;
  }
  const screenshotsValue = (outputs as Record<string, unknown>).screenshots;
  if (!screenshotsValue || typeof screenshotsValue !== "object") {
    return true;
  }
  const screenshots = screenshotsValue as Record<string, unknown>;
  if (typeof screenshots.enabled === "boolean") {
    return screenshots.enabled;
  }
  return true;
}

function readVariableDefault(scenario: AutomationScenario, variableId: string): string {
  for (const variable of scenario.variables) {
    if (variable.id !== variableId) {
      continue;
    }
    if (variable.default === undefined || variable.default === null) {
      return "";
    }
    return String(variable.default);
  }
  return "";
}

function readMetadataString(scenario: AutomationScenario, key: string): string {
  const value = scenario.metadata[key];
  return typeof value === "string" ? value : "";
}

function readExecutionString(scenario: AutomationScenario, key: string): string {
  if (!scenario.execution || typeof scenario.execution !== "object") {
    return "";
  }
  const value = scenario.execution[key];
  return typeof value === "string" ? value : "";
}

function readExecutionObject(
  scenario: AutomationScenario,
  key: string
): Record<string, unknown> | undefined {
  if (!scenario.execution || typeof scenario.execution !== "object") {
    return undefined;
  }
  const value = scenario.execution[key];
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function requiredStringFromInput(step: ScenarioStepAction, key: string): string {
  const value = readStringFromInput(step, key);
  if (value === "") {
    throw new Error(`Step "${step.id}" requires input.${key}.`);
  }
  return toRobotCell(value);
}

function readStringFromInput(step: ScenarioStepAction, key: string): string {
  if (!step.input || typeof step.input !== "object") {
    return "";
  }
  const value = step.input[key];
  if (typeof value !== "string") {
    return "";
  }
  return value;
}

function readStringListFromInput(step: ScenarioStepAction, key: string): string[] {
  if (!step.input || typeof step.input !== "object") {
    return [];
  }
  const raw = step.input[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item !== "");
}

function numberFromInput(step: ScenarioStepAction, key: string, fallback: number): string {
  if (!step.input || typeof step.input !== "object") {
    return `${fallback}`;
  }
  const value = step.input[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return `${parsed}`;
    }
  }
  return `${fallback}`;
}

function readTimingNumber(step: ScenarioStepAction, key: string, fallback: number): number {
  if (!step.timing || typeof step.timing !== "object") {
    return fallback;
  }
  const value = step.timing[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function waitSecondsFromTiming(step: ScenarioStepAction, fallback: number): string {
  if (!step.timing || typeof step.timing !== "object") {
    return `${fallback}`;
  }
  const stability = step.timing.stability_ms;
  if (typeof stability === "number" && Number.isFinite(stability)) {
    return `${Math.max(0, stability / 1000)}`;
  }
  return `${fallback}`;
}

function collectTargetCandidates(
  target: unknown,
  output: Array<Record<string, unknown>>,
  visited: Set<Record<string, unknown>>
): void {
  if (!target || typeof target !== "object") {
    return;
  }
  const record = target as Record<string, unknown>;
  if (visited.has(record)) {
    return;
  }
  visited.add(record);
  output.push(record);

  const fallbacks = record.fallbacks;
  if (!Array.isArray(fallbacks)) {
    return;
  }
  for (const fallback of fallbacks) {
    collectTargetCandidates(fallback, output, visited);
  }
}

function selectTargetCandidate(
  target: unknown,
  allowedStrategies: Set<string>,
  context: string
): Record<string, unknown> {
  const matches = selectTargetCandidates(target, allowedStrategies, context);
  return matches[0];
}

function selectTargetCandidates(
  target: unknown,
  allowedStrategies: Set<string>,
  context: string
): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = [];
  collectTargetCandidates(target, candidates, new Set<Record<string, unknown>>());

  const matches = candidates.filter((candidate) => {
    try {
      const strategy = readTargetStrategy(candidate);
      return allowedStrategies.has(strategy);
    } catch {
      return false;
    }
  });
  if (matches.length > 0) {
    return matches;
  }

  const seenStrategies = candidates
    .map((candidate) => {
      try {
        return readTargetStrategy(candidate);
      } catch {
        return "<missing>";
      }
    })
    .join(", ");
  throw new Error(
    `No compatible selector for ${context}. allowed=${Array.from(allowedStrategies).join(",")}, seen=${seenStrategies || "none"}`
  );
}

function resolveWebLocator(target: unknown): string {
  const candidate = selectTargetCandidate(target, new Set(["web"]), "web step");
  const web = candidate.web;
  if (!web || typeof web !== "object") {
    throw new Error("web target requires web selector object.");
  }
  const selector = web as Record<string, unknown>;

  const css = selector.css;
  if (typeof css === "string" && css.trim() !== "") {
    return toRobotCell(`css:${css}`);
  }

  const xpath = selector.xpath;
  if (typeof xpath === "string" && xpath.trim() !== "") {
    return toRobotCell(`xpath:${xpath}`);
  }

  const role = typeof selector.role === "string" ? selector.role.trim() : "";
  const name = typeof selector.name === "string" ? selector.name.trim() : "";
  const text = typeof selector.text === "string" ? selector.text.trim() : "";

  if (text !== "" && role === "" && name === "") {
    return toRobotCell(`xpath://*[contains(normalize-space(.), ${escapeXpathLiteral(text)})]`);
  }

  if (role !== "" || name !== "" || text !== "") {
    const predicates: string[] = [];
    if (role !== "") {
      predicates.push(`@role=${escapeXpathLiteral(role)}`);
    }
    if (name !== "") {
      const escapedName = escapeXpathLiteral(name);
      predicates.push(`(@aria-label=${escapedName} or normalize-space(.)=${escapedName})`);
    }
    if (text !== "") {
      predicates.push(`contains(normalize-space(.), ${escapeXpathLiteral(text)})`);
    }
    return toRobotCell(`xpath://*[${predicates.join(" and ")}]`);
  }

  throw new Error("web selector requires css/xpath/role/name/text.");
}

function escapeXpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  const parts = value.split("'");
  return `concat(${parts
    .map((part, index) => {
      const literal = `'${part}'`;
      if (index === parts.length - 1) {
        return literal;
      }
      return `${literal}, "\\'", `;
    })
    .join("")})`;
}

function readNestedTarget(
  input: Record<string, unknown> | undefined,
  key: string
): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    throw new Error(`input.${key} is required.`);
  }
  const value = input[key];
  if (!value || typeof value !== "object") {
    throw new Error(`input.${key} target is required.`);
  }
  return value as Record<string, unknown>;
}

function readTargetStrategy(target: unknown): string {
  if (!target || typeof target !== "object") {
    throw new Error("target is required.");
  }
  const strategy = (target as Record<string, unknown>).strategy;
  if (typeof strategy !== "string" || strategy.trim() === "") {
    throw new Error("target.strategy is required.");
  }
  return strategy;
}

function unitySelectorArgsFromCandidate(candidate: Record<string, unknown>, prefix = ""): string {
  if (readTargetStrategy(candidate) !== "uia") {
    throw new Error("uia target strategy required.");
  }
  const uia = candidate.uia;
  if (!uia || typeof uia !== "object") {
    throw new Error("uia target requires uia object.");
  }
  const selector = uia as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["title", "automation_id", "class_name", "control_type", "index"]) {
    const value = selector[key];
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text === "") {
      continue;
    }
    parts.push(`${prefix}${key}=${text}`);
  }
  if (parts.length === 0) {
    throw new Error("uia selector requires at least one attribute.");
  }
  return `    ${parts.join("    ")}`;
}

function readUnityHierarchyPathFromCandidate(candidate: Record<string, unknown>): string {
  if (readTargetStrategy(candidate) !== "unity_hierarchy") {
    throw new Error("unity_hierarchy strategy is required.");
  }
  const hierarchy = candidate.unity_hierarchy;
  if (!hierarchy || typeof hierarchy !== "object") {
    throw new Error("unity_hierarchy object is required.");
  }
  const path = (hierarchy as Record<string, unknown>).path;
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("unity_hierarchy.path is required.");
  }
  return toRobotCell(path);
}

function requiredCoordinateFromCandidate(candidate: Record<string, unknown>): {
  xRatio: string;
  yRatio: string;
} {
  if (readTargetStrategy(candidate) !== "coordinate") {
    throw new Error("coordinate strategy is required.");
  }
  const coordinate = candidate.coordinate;
  if (!coordinate || typeof coordinate !== "object") {
    throw new Error("coordinate object is required.");
  }
  const coordinateRecord = coordinate as Record<string, unknown>;
  const x = coordinateRecord.x_ratio;
  const y = coordinateRecord.y_ratio;
  if (
    (typeof x !== "number" && typeof x !== "string") ||
    (typeof y !== "number" && typeof y !== "string")
  ) {
    throw new Error("coordinate x_ratio/y_ratio are required.");
  }
  return { xRatio: String(x), yRatio: String(y) };
}

function normalizeUnityMode(value: string): "attach" | "launch" {
  return value.toLowerCase() === "launch" ? "launch" : "attach";
}

function toRobotCell(value: string): string {
  return value.replaceAll(/\s{2,}/g, " ").trim();
}

function toRobotOptionalCell(value: string): string {
  const normalized = toRobotCell(value);
  return normalized === "" ? "${EMPTY}" : normalized;
}

function interpolateString(text: string, values: Record<string, unknown>): string {
  return text.replaceAll(/\$\{([a-zA-Z_][a-zA-Z0-9_.-]*)\}/g, (_, key) => {
    const value = getPathValue(values, key);
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  });
}

function resolveTemplate<T>(input: T, values: Record<string, unknown>): T {
  if (typeof input === "string") {
    return interpolateString(input, values) as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => resolveTemplate(item, values)) as T;
  }
  if (input && typeof input === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      output[key] = resolveTemplate(value, values);
    }
    return output as T;
  }
  return input;
}
