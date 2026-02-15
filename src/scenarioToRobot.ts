import type {
  AutomationScenario,
  ScenarioStep,
  ScenarioStepAction,
} from "./scenarioSpec.js";

const WEB_ACTIONS = new Set([
  "open_url",
  "click",
  "drag_drop",
  "type_text",
  "wait_for",
  "press_keys",
  "screenshot",
]);

const UNITY_ACTIONS = new Set([
  "click",
  "drag_drop",
  "type_text",
  "wait_for",
  "press_keys",
  "open_menu",
  "screenshot",
]);

export function generateRobotSuiteFromScenario(
  scenario: AutomationScenario,
): string {
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
  const stepLines = flattenSteps(scenario.steps).flatMap((step) =>
    toWebStepLines(step),
  );

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
    "",
  ].join("\n");
}

function generateUnityRobotSuite(scenario: AutomationScenario): string {
  const unityMode = normalizeUnityMode(readUnityExecutionMode(scenario));
  const unityProjectPath = toRobotOptionalCell(readUnityProjectPath(scenario));
  const unityWindowHint = toRobotCell(readUnityWindowHint(scenario));
  const stepLines = flattenSteps(scenario.steps).flatMap((step) =>
    toUnityStepLines(step),
  );

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
    "",
  ].join("\n");
}

function flattenSteps(
  steps: ScenarioStep[],
  parentTitles: string[] = [],
): ScenarioStepAction[] {
  const output: ScenarioStepAction[] = [];
  for (const step of steps) {
    if (step.kind === "group") {
      output.push(...flattenSteps(step.steps, [...parentTitles, step.title]));
      continue;
    }
    if (step.kind === "control") {
      throw new Error(
        `Unsupported control step for Robot export: ${step.control} (${step.id})`,
      );
    }
    const titlePrefix =
      parentTitles.length > 0 ? `${parentTitles.join(" > ")} > ` : "";
    output.push({ ...step, title: `${titlePrefix}${step.title}` });
  }
  return output;
}

function toWebStepLines(step: ScenarioStepAction): string[] {
  ensureActionSupported(step, WEB_ACTIONS, "web");
  const id = toRobotCell(step.id);
  const title = toRobotCell(step.title);
  const description = toRobotOptionalCell(step.description ?? "");

  if (step.action === "open_url") {
    const url = requiredStringFromInput(step, "url");
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Go To    ${url}`,
    ];
  }
  if (step.action === "click") {
    const locator = resolveWebLocator(step.target);
    return [
      `        Doc Web Click Step    ${id}    ${title}    ${description}    ${locator}`,
    ];
  }
  if (step.action === "drag_drop") {
    const sourceLocator = resolveWebLocator(
      readNestedTarget(step.input, "source"),
    );
    const targetLocator = resolveWebLocator(step.target);
    return [
      `        Doc Web Drag Step    ${id}    ${title}    ${description}    ${sourceLocator}    ${targetLocator}`,
    ];
  }
  if (step.action === "type_text") {
    const locator = resolveWebLocator(step.target);
    const text = requiredStringFromInput(step, "text");
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Input Text    ${locator}    ${text}`,
    ];
  }
  if (step.action === "wait_for") {
    const seconds = numberFromInput(step, "seconds", 1);
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Sleep    ${seconds}`,
    ];
  }
  if (step.action === "press_keys") {
    const shortcut = readStringFromInput(step, "shortcut");
    const keys = readStringFromInput(step, "keys");
    const value = toRobotCell(shortcut || keys || "{ENTER}");
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Press Keys    NONE    ${value}`,
    ];
  }
  if (step.action === "screenshot") {
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    No Operation`,
    ];
  }

  throw new Error(`Unsupported web action: ${step.action}`);
}

function toUnityStepLines(step: ScenarioStepAction): string[] {
  ensureActionSupported(step, UNITY_ACTIONS, "unity");
  const id = toRobotCell(step.id);
  const title = toRobotCell(step.title);
  const description = toRobotOptionalCell(step.description ?? "");

  if (step.action === "click") {
    const strategy = readTargetStrategy(step.target);
    if (strategy === "unity_hierarchy") {
      const path = readUnityHierarchyPath(step.target);
      return [
        `        \${annotation}=    Wait Until Keyword Succeeds    45 sec    1 sec    Select Unity Hierarchy Object    hierarchy_path=${path}    timeout_seconds=4.0`,
        `        Wait For Seconds    ${waitSecondsFromTiming(step, 0.0)}`,
        "        Emit Annotation Metadata    ${annotation}",
      ];
    }
    if (strategy === "uia") {
      const selectorArgs = unitySelectorArgs(step.target);
      return [
        `        \${annotation}=    Click Unity Element${selectorArgs}`,
        `        Wait For Seconds    ${waitSecondsFromTiming(step, 0.0)}`,
        "        Emit Annotation Metadata    ${annotation}",
      ];
    }
    if (strategy === "coordinate") {
      const coordinate = requiredCoordinate(step.target);
      return [
        `        Doc Desktop Step    ${id}    ${title}    ${description}    Unity Click Relative And Emit    ${coordinate.xRatio}    ${coordinate.yRatio}    180    48    ${waitSecondsFromTiming(step, 0.8)}`,
      ];
    }
    throw new Error(`Unsupported unity click target strategy: ${strategy}`);
  }

  if (step.action === "drag_drop") {
    const source = readNestedTarget(step.input, "source");
    const sourceStrategy = readTargetStrategy(source);
    const targetStrategy = readTargetStrategy(step.target);
    if (sourceStrategy === "uia" && targetStrategy === "uia") {
      const sourceArgs = unitySelectorArgs(source, "source_");
      const targetArgs = unitySelectorArgs(step.target, "target_");
      return [
        `        \${annotation}=    Drag Unity Element To Element${sourceArgs}${targetArgs}`,
        `        Wait For Seconds    ${waitSecondsFromTiming(step, 0.0)}`,
        "        Emit Annotation Metadata    ${annotation}",
      ];
    }
    if (sourceStrategy === "coordinate" && targetStrategy === "coordinate") {
      const sourceCoordinate = requiredCoordinate(source);
      const targetCoordinate = requiredCoordinate(step.target);
      return [
        `        Doc Desktop Step    ${id}    ${title}    ${description}    Unity Drag Relative And Emit    ${sourceCoordinate.xRatio}    ${sourceCoordinate.yRatio}    ${targetCoordinate.xRatio}    ${targetCoordinate.yRatio}    ${waitSecondsFromTiming(step, 0.8)}`,
      ];
    }
    throw new Error(
      `Unsupported unity drag_drop selector strategy pair: ${sourceStrategy} -> ${targetStrategy}`,
    );
  }

  if (step.action === "type_text") {
    const text = requiredStringFromInput(step, "text");
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Type Unity Text    ${text}`,
    ];
  }
  if (step.action === "wait_for") {
    const seconds = numberFromInput(step, "seconds", 1);
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Wait For Seconds    ${seconds}`,
    ];
  }
  if (step.action === "press_keys") {
    const shortcut = readStringFromInput(step, "shortcut");
    if (shortcut !== "") {
      return [
        `        Doc Desktop Step    ${id}    ${title}    ${description}    Send Unity Shortcut    ${toRobotCell(shortcut)}`,
      ];
    }
    const keys = readStringFromInput(step, "keys");
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Press Unity Keys    ${toRobotCell(keys || "{ENTER}")}`,
    ];
  }
  if (step.action === "open_menu") {
    const menuPath = requiredStringFromInput(step, "menu_path");
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Open Unity Top Menu    ${menuPath}`,
    ];
  }
  if (step.action === "screenshot") {
    const path = readStringFromInput(step, "path");
    if (path !== "") {
      return [`        Capture Unity Screenshot    ${toRobotCell(path)}`];
    }
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    No Operation`,
    ];
  }

  throw new Error(`Unsupported unity action: ${step.action}`);
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
    "Require Unity Project Path",
    "    [Arguments]    ${project_path}",
    "    ${normalized}=    Evaluate    str($project_path).strip()",
    "    IF    '${normalized}' == ''",
    "        Fail    unity_project_path is required when unity_execution_mode is launch.",
    "    END",
    "",
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
    "Doc Web Drag Step",
    "    [Arguments]    ${id}    ${title}    ${description}    ${source_locator}    ${target_locator}",
    "    Ensure Artifact Directories",
    "    ${source}=    Get Element Screen Box    ${source_locator}",
    "    ${target}=    Get Element Screen Box    ${target_locator}",
    "    Drag And Drop    ${source_locator}    ${target_locator}",
    "    Save Step Screenshot    ${id}",
    "    ${from_point}=    Create Dictionary    x=${source}[4]    y=${source}[5]",
    "    ${to_point}=    Create Dictionary    x=${target}[4]    y=${target}[5]",
    "    ${annotation}=    Create Dictionary    type=dragDrop    from=${from_point}    to=${to_point}",
    "    ${metadata}=    Create Dictionary    annotation=${annotation}",
    "    Emit Step Metadata    ${metadata}",
    "",
    "Normalize Css Selector",
    "    [Arguments]    ${locator}",
    "    ${selector}=    Set Variable    ${locator}",
    "    ${is_css}=    Evaluate    str($locator).startswith('css:')",
    "    IF    ${is_css}",
    "        ${selector}=    Evaluate    str($locator)[4:]",
    "    END",
    "    RETURN    ${selector}",
    "",
    "Get Element Screen Box",
    "    [Arguments]    ${locator}",
    "    ${selector}=    Normalize Css Selector    ${locator}",
    "    ${box}=    Execute JavaScript    const selector = arguments[0]; const el = document.querySelector(selector); if (!el) { return null; } const rect = el.getBoundingClientRect(); const sx = window.screenX ?? window.screenLeft ?? 0; const sy = window.screenY ?? window.screenTop ?? 0; const viewportX = sx + Math.max(0, (window.outerWidth - window.innerWidth) / 2); const viewportY = sy + Math.max(0, window.outerHeight - window.innerHeight); return [Math.round(viewportX + rect.left), Math.round(viewportY + rect.top), Math.round(rect.width), Math.round(rect.height), Math.round(viewportX + rect.left + rect.width / 2), Math.round(viewportY + rect.top + rect.height / 2)];    ARGUMENTS    ${selector}",
    "    Should Not Be Equal    ${box}    ${None}",
    "    RETURN    ${box}",
    "",
  ];
}

function unityKeywordLines(): string[] {
  return [
    "Unity Click Relative And Emit",
    "    [Arguments]    ${x_ratio}    ${y_ratio}    ${box_width}=180    ${box_height}=48    ${wait_seconds}=0.8",
    "    ${annotation}=    Click Unity Relative    ${x_ratio}    ${y_ratio}    box_width=${box_width}    box_height=${box_height}",
    "    Wait For Seconds    ${wait_seconds}",
    "    Emit Annotation Metadata    ${annotation}",
    "",
    "Unity Drag Relative And Emit",
    "    [Arguments]    ${from_x_ratio}    ${from_y_ratio}    ${to_x_ratio}    ${to_y_ratio}    ${wait_seconds}=0.8",
    "    ${annotation}=    Drag Unity Relative    ${from_x_ratio}    ${from_y_ratio}    ${to_x_ratio}    ${to_y_ratio}",
    "    Wait For Seconds    ${wait_seconds}",
    "    Emit Annotation Metadata    ${annotation}",
    "",
  ];
}

function ensureActionSupported(
  step: ScenarioStepAction,
  allowed: Set<string>,
  target: "web" | "unity",
): void {
  if (!allowed.has(step.action)) {
    throw new Error(
      `Unsupported action "${step.action}" for target "${target}" at step "${step.id}".`,
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
    attach && typeof attach.window_hint_var === "string"
      ? attach.window_hint_var
      : "";
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

function readVariableDefault(
  scenario: AutomationScenario,
  variableId: string,
): string {
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

function readExecutionString(
  scenario: AutomationScenario,
  key: string,
): string {
  if (!scenario.execution || typeof scenario.execution !== "object") {
    return "";
  }
  const value = scenario.execution[key];
  return typeof value === "string" ? value : "";
}

function readExecutionObject(
  scenario: AutomationScenario,
  key: string,
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

function requiredStringFromInput(
  step: ScenarioStepAction,
  key: string,
): string {
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

function numberFromInput(
  step: ScenarioStepAction,
  key: string,
  fallback: number,
): string {
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

function waitSecondsFromTiming(
  step: ScenarioStepAction,
  fallback: number,
): string {
  if (!step.timing || typeof step.timing !== "object") {
    return `${fallback}`;
  }
  const stability = step.timing.stability_ms;
  if (typeof stability === "number" && Number.isFinite(stability)) {
    return `${Math.max(0, stability / 1000)}`;
  }
  return `${fallback}`;
}

function resolveWebLocator(target: unknown): string {
  if (!target || typeof target !== "object") {
    throw new Error("web step requires target.");
  }
  const targetRecord = target as Record<string, unknown>;
  const strategy = String(targetRecord.strategy ?? "");
  if (strategy !== "web") {
    throw new Error(`web target strategy must be "web", got: ${strategy}`);
  }
  const web = targetRecord.web;
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
  const text = selector.text;
  if (typeof text === "string" && text.trim() !== "") {
    return toRobotCell(`//*[contains(normalize-space(.), "${text}")]`);
  }
  throw new Error("web selector requires css/xpath/text.");
}

function readNestedTarget(
  input: Record<string, unknown> | undefined,
  key: string,
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

function unitySelectorArgs(target: unknown, prefix = ""): string {
  if (!target || typeof target !== "object") {
    throw new Error("uia target is required.");
  }
  const targetRecord = target as Record<string, unknown>;
  if (targetRecord.strategy !== "uia") {
    throw new Error(
      `uia target strategy required, got: ${targetRecord.strategy}`,
    );
  }
  const uia = targetRecord.uia;
  if (!uia || typeof uia !== "object") {
    throw new Error("uia target requires uia object.");
  }
  const selector = uia as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of [
    "title",
    "automation_id",
    "class_name",
    "control_type",
    "index",
  ]) {
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

function readUnityHierarchyPath(target: unknown): string {
  if (!target || typeof target !== "object") {
    throw new Error("unity_hierarchy target is required.");
  }
  const targetRecord = target as Record<string, unknown>;
  if (targetRecord.strategy !== "unity_hierarchy") {
    throw new Error("unity_hierarchy strategy is required.");
  }
  const hierarchy = targetRecord.unity_hierarchy;
  if (!hierarchy || typeof hierarchy !== "object") {
    throw new Error("unity_hierarchy object is required.");
  }
  const path = (hierarchy as Record<string, unknown>).path;
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("unity_hierarchy.path is required.");
  }
  return toRobotCell(path);
}

function requiredCoordinate(target: unknown): {
  xRatio: string;
  yRatio: string;
} {
  if (!target || typeof target !== "object") {
    throw new Error("coordinate target is required.");
  }
  const targetRecord = target as Record<string, unknown>;
  if (targetRecord.strategy !== "coordinate") {
    throw new Error(
      `coordinate target strategy required, got: ${targetRecord.strategy}`,
    );
  }
  const coordinate = targetRecord.coordinate;
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
