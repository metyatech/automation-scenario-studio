import { describe, expect, it } from "vitest";

import { parseArgs, parseBooleanArg, parseVariableArg } from "../src/cli.js";

describe("cli argument parsing", () => {
  it("parses run-scenario options including profile and repeated vars", () => {
    const parsed = parseArgs([
      "--scenario",
      "./scenarios/unity.scenario.json",
      "--output",
      "./artifacts/unity",
      "--markdown",
      "./docs/unity.md",
      "--record-video",
      "true",
      "--profile",
      "docs",
      "--var",
      "unity_window_hint=Unity",
      "--var",
      "menu_path=Tools/Build",
    ]);

    expect(parsed).toEqual({
      scenarioPath: "./scenarios/unity.scenario.json",
      outputDir: "./artifacts/unity",
      markdownPath: "./docs/unity.md",
      recordVideo: true,
      profile: "docs",
      variables: {
        unity_window_hint: "Unity",
        menu_path: "Tools/Build",
      },
    });
  });

  it("rejects invalid boolean values", () => {
    expect(() => parseBooleanArg("yes")).toThrow("Invalid boolean value: yes");
  });

  it("rejects malformed variable values", () => {
    expect(() => parseVariableArg("menu_path")).toThrow(
      "Invalid --var value: menu_path",
    );
  });
});
