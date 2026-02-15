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
  it("renders web scenario with doc keywords", () => {
    const scenario: AutomationScenario = {
      schema_version: "1.0.0",
      scenario_id: "web-example",
      name: "Web Example",
      target: "web",
      metadata: {
        start_url: "https://example.com",
        browser: "chrome",
      },
      steps: [
        {
          id: "open-example",
          title: "Open example.com",
          description: "Open top page.",
          action: "open_url",
          params: {
            url: "https://example.com",
          },
        },
        {
          id: "click-link",
          title: "Click link",
          action: "click",
          params: {
            locator: "css:a",
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

  it("renders unity scenario with launch mode", () => {
    const scenario: AutomationScenario = {
      schema_version: "1.0.0",
      scenario_id: "unity-example",
      name: "Unity Example",
      target: "unity",
      metadata: {
        unity_execution_mode: "launch",
        unity_project_path: "D:/projects/sample",
        target_window_hint: "Unity",
      },
      steps: [
        {
          id: "click-scene",
          title: "Click scene",
          action: "click",
          params: {
            x_ratio: 0.5,
            y_ratio: 0.5,
          },
        },
        {
          id: "save",
          title: "Save",
          action: "shortcut",
          params: {
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
    expect(suite).toContain("Doc Desktop Step    click-scene");
    expect(suite).toContain("Unity Click Relative And Emit");
    expect(suite).toContain("Doc Desktop Step    save");
  });
});
