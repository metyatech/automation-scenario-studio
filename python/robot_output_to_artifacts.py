#!/usr/bin/env python
"""Convert Robot Framework output.xml into run-artifacts JSON."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from robot.api import ExecutionResult, ResultVisitor


DOC_KEYWORDS = {"Doc Web Step", "Doc Desktop Step"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-xml", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--artifacts-json", required=True)
    parser.add_argument("--suite-id")
    parser.add_argument("--video-path")
    parser.add_argument("--manifest-path")
    return parser.parse_args()


def sanitize_id(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return cleaned.strip("-") or "robot-suite"


def parse_time_ms(value: str | None) -> int | None:
    if not value:
        return None

    patterns = [
        "%Y%m%d %H:%M:%S.%f",
        "%Y%m%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
    ]

    for pattern in patterns:
        try:
            return int(datetime.strptime(value, pattern).timestamp() * 1000)
        except ValueError:
            continue

    return None


class DocStepVisitor(ResultVisitor):
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.steps: list[dict[str, Any]] = []
        self.counter = 0

    def end_keyword(self, keyword):  # type: ignore[override]
        if keyword.status != "PASS" or keyword.kwname not in DOC_KEYWORDS:
            return

        self.counter += 1
        args = list(keyword.args)

        step_id = args[0] if len(args) > 0 and args[0] else f"step-{self.counter}"
        title = args[1] if len(args) > 1 and args[1] else step_id
        description = args[2] if len(args) > 2 else ""

        image_path = self.output_dir / "screenshots" / f"{step_id}.png"

        start_ms = parse_time_ms(getattr(keyword, "starttime", None))
        elapsed_ms = int(getattr(keyword, "elapsedtime", 0) or 0)
        end_ms = start_ms + elapsed_ms if start_ms is not None else None

        step: dict[str, Any] = {
            "id": step_id,
            "title": title,
            "imagePath": str(image_path),
        }
        if description:
            step["description"] = description
        if start_ms is not None:
            step["startedAtMs"] = start_ms
        if end_ms is not None:
            step["endedAtMs"] = end_ms

        self.steps.append(step)


def main() -> int:
    args = parse_args()

    output_xml = Path(args.output_xml).resolve()
    output_dir = Path(args.output_dir).resolve()
    artifacts_json = Path(args.artifacts_json).resolve()
    manifest_path = (
        Path(args.manifest_path).resolve()
        if args.manifest_path
        else output_dir / "unity-manifest.json"
    )

    result = ExecutionResult(str(output_xml))
    suite_name = result.suite.name if result.suite and result.suite.name else "Robot Suite"
    scenario_id = args.suite_id or sanitize_id(suite_name)

    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        artifacts: dict[str, Any] = {
            "scenarioId": scenario_id,
            "title": suite_name,
            "steps": manifest.get("steps", []),
            "videoPath": manifest.get("videoPath"),
            "rawVideoPath": manifest.get("rawVideoPath"),
        }
    else:
        visitor = DocStepVisitor(output_dir)
        result.visit(visitor)

        artifacts = {
            "scenarioId": scenario_id,
            "title": suite_name,
            "steps": visitor.steps,
        }

    if args.video_path and Path(args.video_path).exists() and not artifacts.get("videoPath"):
        artifacts["videoPath"] = args.video_path
        artifacts["rawVideoPath"] = args.video_path

    artifacts_json.parent.mkdir(parents=True, exist_ok=True)
    artifacts_json.write_text(
        json.dumps(artifacts, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
