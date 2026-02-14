import { describe, expect, it } from "vitest";

import {
  buildConverterCommandArgs,
  buildRobotCommandArgs,
} from "../src/robotRunner.js";

describe("robot runner command builders", () => {
  it("builds robot CLI args", () => {
    const args = buildRobotCommandArgs("D:/out/robot", "D:/suite/web.robot");

    expect(args).toEqual([
      "-m",
      "robot",
      "--outputdir",
      "D:/out/robot",
      "--output",
      "output.xml",
      "--log",
      "NONE",
      "--report",
      "NONE",
      "D:/suite/web.robot",
    ]);
  });

  it("includes video path only when provided", () => {
    const withVideo = buildConverterCommandArgs({
      converterPath: "D:/tool/robot_output_to_artifacts.py",
      outputXmlPath: "D:/out/robot/output.xml",
      outputDir: "D:/out",
      artifactsPath: "D:/out/steps.json",
      suiteId: "web-example",
      videoPath: "D:/out/video/raw.mp4",
    });

    const withoutVideo = buildConverterCommandArgs({
      converterPath: "D:/tool/robot_output_to_artifacts.py",
      outputXmlPath: "D:/out/robot/output.xml",
      outputDir: "D:/out",
      artifactsPath: "D:/out/steps.json",
      suiteId: "web-example",
    });

    expect(withVideo).toContain("--video-path");
    expect(withVideo).toContain("D:/out/video/raw.mp4");
    expect(withoutVideo).not.toContain("--video-path");
  });
});
