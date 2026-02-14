# automation-scenario-studio

CLI entrypoint for scenario validation and execution.

## Overview

This package composes:

- `@metyatech/automation-scenario-runtime` for execution
- `@metyatech/automation-scenario-renderer` for markdown and media outputs
- `@metyatech/automation-scenario-spec` for schema validation
- Robot Framework CLI for `.robot` suites

## Install

```bash
npm install @metyatech/automation-scenario-studio
```

## CLI

```bash
automation-scenario validate --scenario ./automation/scenarios/web-example.yaml
automation-scenario run --scenario ./automation/scenarios/web-example.yaml --output ./artifacts/web-example --markdown ./docs/controls/auto-web-example.md
automation-scenario run-robot --suite ./automation/robot/web-example.robot --output ./artifacts/web-example --markdown ./docs/controls/auto-web-example.md
```

Parameters:

- `--scenario` (required): scenario YAML path
- `--suite` (required for `run-robot`): Robot Framework suite path
- `--only` (optional): execute a single step by id
- `--output` (optional): artifact directory override
- `--markdown` (optional): markdown output path override
- `--record-video` (optional): `true`/`false` for desktop recording in `run-robot`

Robot execution prerequisites:

```bash
python -m pip install robotframework robotframework-seleniumlibrary selenium
```

Annotation metadata can be emitted from Robot keywords by logging `DOCMETA:<json>` in `output.xml`.
Built-in renderer currently draws `click` and `dragDrop`, and the metadata structure is extensible for future annotation types.

## Development

```bash
npm install
npm run verify
```

## Compatibility

- Node.js 20+

## Links

- LICENSE: `LICENSE`
- SECURITY: `SECURITY.md`
- CONTRIBUTING: `CONTRIBUTING.md`
- CHANGELOG: `CHANGELOG.md`
