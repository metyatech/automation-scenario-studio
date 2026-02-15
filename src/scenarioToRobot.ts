import type { AutomationScenario, ScenarioStep } from "./scenarioSpec.js";

const WEB_ACTIONS = new Set([
  "open_url",
  "click",
  "drag",
  "type",
  "wait",
  "keys",
  "shortcut",
  "screenshot",
]);

const UNITY_ACTIONS = new Set([
  "click",
  "drag",
  "type",
  "wait",
  "keys",
  "shortcut",
  "menu",
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
  const startUrl = toRobotCell(
    getMetadataString(scenario, "start_url", "about:blank"),
  );
  const browser = toRobotCell(getMetadataString(scenario, "browser", "chrome"));
  const stepLines = scenario.steps.flatMap((step) => toWebStepLines(step));

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
  const unityMode = normalizeUnityMode(
    getMetadataString(scenario, "unity_execution_mode", "attach"),
  );
  const unityProjectPath = toRobotOptionalCell(
    getMetadataString(scenario, "unity_project_path", ""),
  );
  const unityWindowHint = toRobotCell(
    getMetadataString(scenario, "target_window_hint", "Unity"),
  );
  const stepLines = scenario.steps.flatMap((step) => toUnityStepLines(step));

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
    "        Focus Unity Window",
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

function toWebStepLines(step: ScenarioStep): string[] {
  ensureActionSupported(step, WEB_ACTIONS, "web");
  const id = toRobotCell(step.id);
  const title = toRobotCell(step.title);
  const description = toRobotOptionalCell(step.description ?? "");

  if (step.action === "open_url") {
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Go To    ${requiredStringParam(step, "url")}`,
    ];
  }
  if (step.action === "click") {
    return [
      `        Doc Web Click Step    ${id}    ${title}    ${description}    ${requiredStringParam(step, "locator")}`,
    ];
  }
  if (step.action === "drag") {
    return [
      `        Doc Web Drag Step    ${id}    ${title}    ${description}    ${requiredStringParam(step, "source_locator")}    ${requiredStringParam(step, "target_locator")}`,
    ];
  }
  if (step.action === "type") {
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Input Text    ${requiredStringParam(step, "locator")}    ${requiredStringParam(step, "text")}`,
    ];
  }
  if (step.action === "wait") {
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Sleep    ${numberParam(step, "seconds", 1)}`,
    ];
  }
  if (step.action === "keys") {
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Press Keys    NONE    ${requiredStringParam(step, "keys")}`,
    ];
  }
  if (step.action === "shortcut") {
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    Press Keys    NONE    ${requiredStringParam(step, "shortcut")}`,
    ];
  }
  if (step.action === "screenshot") {
    return [
      `        Doc Web Step    ${id}    ${title}    ${description}    No Operation`,
    ];
  }

  throw new Error(`Unsupported web action: ${step.action}`);
}

function toUnityStepLines(step: ScenarioStep): string[] {
  ensureActionSupported(step, UNITY_ACTIONS, "unity");
  const id = toRobotCell(step.id);
  const title = toRobotCell(step.title);
  const description = toRobotOptionalCell(step.description ?? "");

  if (step.action === "click") {
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Unity Click Relative And Emit    ${numberParam(step, "x_ratio", 0.5)}    ${numberParam(step, "y_ratio", 0.5)}    ${numberParam(step, "box_width", 180)}    ${numberParam(step, "box_height", 48)}    ${numberParam(step, "wait_seconds", 0.8)}`,
    ];
  }
  if (step.action === "drag") {
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Unity Drag Relative And Emit    ${numberParam(step, "from_x_ratio", 0.2)}    ${numberParam(step, "from_y_ratio", 0.4)}    ${numberParam(step, "to_x_ratio", 0.7)}    ${numberParam(step, "to_y_ratio", 0.4)}    ${numberParam(step, "wait_seconds", 0.8)}`,
    ];
  }
  if (step.action === "type") {
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Type Unity Text    ${requiredStringParam(step, "text")}`,
    ];
  }
  if (step.action === "wait") {
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Wait For Seconds    ${numberParam(step, "seconds", 1)}`,
    ];
  }
  if (step.action === "keys") {
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Press Unity Keys    ${requiredStringParam(step, "keys")}`,
    ];
  }
  if (step.action === "shortcut") {
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Send Unity Shortcut    ${requiredStringParam(step, "shortcut")}`,
    ];
  }
  if (step.action === "menu") {
    return [
      `        Doc Desktop Step    ${id}    ${title}    ${description}    Open Unity Top Menu    ${requiredStringParam(step, "menu_path")}`,
    ];
  }
  if (step.action === "screenshot") {
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
  step: ScenarioStep,
  allowed: Set<string>,
  target: "web" | "unity",
): void {
  if (!allowed.has(step.action)) {
    throw new Error(
      `Unsupported action "${step.action}" for target "${target}" at step "${step.id}".`,
    );
  }
}

function requiredStringParam(step: ScenarioStep, key: string): string {
  const value = step.params[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Step "${step.id}" requires string param "${key}".`);
  }
  return toRobotCell(value);
}

function numberParam(
  step: ScenarioStep,
  key: string,
  fallback: number,
): string {
  const value = step.params[key];
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

function getMetadataString(
  scenario: AutomationScenario,
  key: string,
  fallback: string,
): string {
  const value = scenario.metadata[key];
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return fallback;
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
