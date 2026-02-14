import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateScenarioCommand } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("validateScenarioCommand", () => {
  it("returns basic scenario metadata", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "studio-scenario-"));
    tempDirs.push(tempDir);
    const scenarioPath = join(tempDir, "scenario.yaml");

    await writeFile(
      scenarioPath,
      [
        "id: sample",
        "driver: playwright",
        "steps:",
        "  - id: open",
        "    title: Open",
        "    action: goto",
        "    url: https://example.com",
      ].join("\n"),
      "utf8",
    );

    const result = await validateScenarioCommand(scenarioPath);
    expect(result).toEqual({ scenarioId: "sample", steps: 1 });
  });
});
