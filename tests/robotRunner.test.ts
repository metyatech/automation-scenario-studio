import { describe, expect, it } from "vitest";

import type { StepArtifact } from "../src/types.js";
import {
  buildConverterCommandArgs,
  buildRobotCommandArgs,
  isDrawableAnnotation,
  toTimelineEvents,
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

  it("converts step timing and annotations into timeline events", () => {
    const steps: StepArtifact[] = [
      {
        id: "click",
        title: "Click",
        imagePath: "x.png",
        annotation: {
          type: "click",
          box: { x: 10, y: 20, width: 100, height: 30 },
        },
        startedAtMs: 2_000,
        endedAtMs: 2_200,
      },
      {
        id: "drag",
        title: "Drag",
        imagePath: "y.png",
        annotation: {
          type: "dragDrop",
          from: { x: 100, y: 150 },
          to: { x: 300, y: 350 },
        },
        startedAtMs: 3_000,
        endedAtMs: 3_800,
      },
    ];

    const events = toTimelineEvents(steps);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "click",
      startSeconds: 0,
    });
    expect(events[1]).toMatchObject({
      type: "dragDrop",
      startSeconds: 1,
    });
  });

  it("accepts only drawable annotations", () => {
    expect(
      isDrawableAnnotation({
        type: "click",
        box: { x: 1, y: 2, width: 3, height: 4 },
      }),
    ).toBe(true);
    expect(
      isDrawableAnnotation({
        type: "dragDrop",
        from: { x: 1, y: 2 },
        to: { x: 3, y: 4 },
      }),
    ).toBe(true);
    expect(isDrawableAnnotation(undefined)).toBe(false);
  });
});
