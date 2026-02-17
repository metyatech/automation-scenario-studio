import { describe, expect, it } from "vitest";

import type { AutomationScenario } from "../src/scenarioSpec.js";
import { normalizeScenario } from "../src/scenarioSpec.js";
import { generateRobotSuiteFromScenario } from "../src/scenarioToRobot.js";

describe("scenario spec", () => {
  it("requires schema_version", () => {
    expect(() =>
      normalizeScenario(
        {
          name: "legacy",
          target: "unity",
          steps: [],
        },
        "D:/tmp/legacy.json",
      ),
    ).toThrow("schema_version is required");
  });
});

describe("scenario to robot", () => {
  it("renders web scenario with v2 action steps", () => {
    const scenario: AutomationScenario = {
      schema_version: "2.0.0",
      scenario_id: "web-example",
      name: "Web Example",
      target: "web",
      metadata: {
        start_url: "https://example.com",
        browser: "chrome",
      },
      variables: [],
      steps: [
        {
          id: "open-example",
          title: "Open example.com",
          description: "Open top page.",
          kind: "action",
          action: "open_url",
          input: {
            url: "https://example.com",
          },
        },
        {
          id: "click-link",
          title: "Click link",
          kind: "action",
          action: "click",
          target: {
            strategy: "web",
            web: {
              css: "a",
            },
          },
        },
      ],
    };

    const suite = generateRobotSuiteFromScenario(scenario);

    expect(suite).toContain("Library    SeleniumLibrary");
    expect(suite).toContain("Doc Web Step    open-example");
    expect(suite).toContain("Doc Web Click Step    click-link");
    expect(suite).toContain("Close All Browsers");
  });

  it("renders unity scenario with launch mode and nested group title", () => {
    const scenario: AutomationScenario = {
      schema_version: "2.0.0",
      scenario_id: "unity-example",
      name: "Unity Example",
      target: "unity",
      metadata: {
        target_window_hint: "Unity",
      },
      execution: {
        mode: "launch",
      },
      variables: [
        {
          id: "unity_project_path",
          type: "path",
          default: "D:/projects/sample",
        },
      ],
      steps: [
        {
          id: "project-setup",
          title: "Project Setup",
          kind: "group",
          steps: [
            {
              id: "click-scene",
              title: "Click scene",
              kind: "action",
              action: "click",
              target: {
                strategy: "uia",
                uia: {
                  title: "Scene",
                  control_type: "Pane",
                },
              },
            },
          ],
        },
        {
          id: "save",
          title: "Save",
          kind: "action",
          action: "press_keys",
          input: {
            shortcut: "CTRL+S",
          },
        },
      ],
    };

    const suite = generateRobotSuiteFromScenario(scenario);

    expect(suite).toContain(
      "Library    robotframework_unity_editor.UnityEditorLibrary",
    );
    expect(suite).toContain(
      "Start Unity Editor    project_path=${unity_project_path}",
    );
    expect(suite).toContain("${annotation}=    Click Unity Element");
    expect(suite).toContain(
      "Doc Desktop Step    save    Save    ${EMPTY}    Send Unity Shortcut    CTRL+S",
    );
  });

  it("expands control steps and emits static annotation lists", () => {
    const scenario: AutomationScenario = {
      schema_version: "2.0.0",
      scenario_id: "control-example",
      name: "Control Example",
      target: "unity",
      metadata: {},
      variables: [],
      outputs: {
        screenshots: {
          enabled: true,
        },
      },
      steps: [
        {
          id: "loop-parts",
          title: "Loop Parts",
          kind: "control",
          control: "for_each",
          items_expression: '["Ear_L","Ear_R"]',
          item_variable: "part",
          steps: [
            {
              id: "open-part-menu",
              title: "Open ${part}",
              kind: "action",
              action: "open_menu",
              input: {
                menu_path: "Tools/${part}",
              },
              annotations: [
                {
                  type: "label",
                  text: "${part}",
                },
              ],
            },
          ],
        },
      ],
    };

    const suite = generateRobotSuiteFromScenario(scenario);
    expect(suite).toContain("Open Unity Top Menu    Tools/Ear_L");
    expect(suite).toContain("Open Unity Top Menu    Tools/Ear_R");
    expect(suite).toContain("Emit Annotation List Metadata");
  });

  it("uses selector fallbacks when primary strategy is unsupported", () => {
    const scenario: AutomationScenario = {
      schema_version: "2.0.0",
      scenario_id: "fallback-example",
      name: "Fallback Example",
      target: "web",
      metadata: {
        start_url: "https://example.com",
        browser: "chrome",
      },
      variables: [],
      steps: [
        {
          id: "click-link",
          title: "Click link",
          kind: "action",
          action: "click",
          target: {
            strategy: "image",
            image: {
              path: "missing.png",
            },
            fallbacks: [
              {
                strategy: "web",
                web: {
                  css: "a.more",
                },
              },
            ],
          },
        },
      ],
    };

    const suite = generateRobotSuiteFromScenario(scenario);
    expect(suite).toContain("Doc Web Click Step    click-link");
    expect(suite).toContain("css:a.more");
  });

  it("uses menu path candidates for unity open_menu steps", () => {
    const scenario: AutomationScenario = {
      schema_version: "2.0.0",
      scenario_id: "unity-menu-fallbacks",
      name: "Unity Menu Fallbacks",
      target: "unity",
      metadata: {},
      variables: [],
      steps: [
        {
          id: "open-control-panel",
          title: "Open control panel",
          kind: "action",
          action: "open_menu",
          input: {
            menu_path_candidates: [
              "VRChat SDK/Show Control Panel",
              "VRChat SDK/Utilities/Show Control Panel",
            ],
          },
        },
      ],
    };

    const suite = generateRobotSuiteFromScenario(scenario);
    expect(suite).toContain("Open Unity Top Menu With Fallbacks");
    expect(suite).toContain("VRChat SDK/Show Control Panel");
    expect(suite).toContain("VRChat SDK/Utilities/Show Control Panel");
  });

  it("uses hierarchy path candidates for select_hierarchy", () => {
    const scenario: AutomationScenario = {
      schema_version: "2.0.0",
      scenario_id: "unity-hierarchy-fallbacks",
      name: "Unity Hierarchy Fallbacks",
      target: "unity",
      metadata: {},
      variables: [],
      steps: [
        {
          id: "select-root",
          title: "Select root",
          kind: "action",
          action: "select_hierarchy",
          target: {
            strategy: "unity_hierarchy",
            unity_hierarchy: {
              path: "AvatarRoot",
            },
            fallbacks: [
              {
                strategy: "unity_hierarchy",
                unity_hierarchy: {
                  path: "Body/AvatarRoot",
                },
              },
            ],
          },
        },
      ],
    };

    const suite = generateRobotSuiteFromScenario(scenario);
    expect(suite).toContain("Select Unity Hierarchy Object With Fallbacks");
    expect(suite).toContain("AvatarRoot");
    expect(suite).toContain("Body/AvatarRoot");
  });
});
