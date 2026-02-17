import { describe, expect, it } from "vitest";

import {
  applyScenarioVariables,
  normalizeScenario,
  validateScenario,
  type AutomationScenario,
} from "../src/scenarioSpec.js";

describe("scenario spec variable resolution", () => {
  it("applies profile variables and runtime overrides", () => {
    const scenario: AutomationScenario = normalizeScenario(
      {
        schema_version: "2.0.0",
        scenario_id: "v2-example",
        name: "V2 Example",
        target: "unity",
        metadata: {
          target_window_hint: "${window_hint}",
        },
        variables: [
          { id: "window_hint", type: "string", default: "Unity" },
          { id: "menu_path", type: "string", required: true },
        ],
        profiles: {
          default: {
            variables: {
              menu_path: "Tools/Build",
            },
          },
        },
        steps: [
          {
            id: "open-menu",
            title: "Open ${menu_path}",
            kind: "action",
            action: "open_menu",
            input: {
              menu_path: "${menu_path}",
            },
          },
        ],
      },
      "D:/tmp/v2.scenario.json",
    );

    validateScenario(scenario);

    const resolved = applyScenarioVariables(scenario, {
      profile: "default",
      variables: {
        window_hint: "Unity Editor",
      },
    });

    expect(resolved.metadata.target_window_hint).toBe("Unity Editor");
    expect(resolved.steps[0]).toMatchObject({
      title: "Open Tools/Build",
      input: {
        menu_path: "Tools/Build",
      },
    });
  });

  it("throws when required variable is unresolved", () => {
    const scenario: AutomationScenario = normalizeScenario(
      {
        schema_version: "2.0.0",
        scenario_id: "required-var-example",
        name: "Required Variable Example",
        target: "unity",
        metadata: {},
        variables: [{ id: "menu_path", type: "string", required: true }],
        steps: [
          {
            id: "open-menu",
            title: "Open Menu",
            kind: "action",
            action: "open_menu",
            input: {
              menu_path: "${menu_path}",
            },
          },
        ],
      },
      "D:/tmp/required-var.scenario.json",
    );

    expect(() => applyScenarioVariables(scenario)).toThrow(
      "required variable is not resolved: menu_path",
    );
  });

  it("normalizes control step with nested branches and loop metadata", () => {
    const scenario = normalizeScenario(
      {
        schema_version: "2.0.0",
        scenario_id: "control-normalize",
        name: "Control Normalize",
        target: "unity",
        metadata: {},
        variables: [],
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
                id: "select-part",
                title: "Select ${part}",
                kind: "action",
                action: "open_menu",
                input: {
                  menu_path: "Tools/${part}",
                },
              },
            ],
          },
          {
            id: "if-example",
            title: "If Example",
            kind: "control",
            control: "if",
            branches: [
              {
                when: "true",
                steps: [
                  {
                    id: "branch-step",
                    title: "Branch step",
                    kind: "action",
                    action: "wait_for",
                    input: {
                      seconds: 0.1,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      "D:/tmp/control-normalize.scenario.json",
    );

    validateScenario(scenario);
    const controlStep = scenario.steps[0];
    expect(controlStep.kind).toBe("control");
    expect(controlStep).toMatchObject({
      control: "for_each",
      item_variable: "part",
      items_expression: '["Ear_L","Ear_R"]',
    });
  });
});
