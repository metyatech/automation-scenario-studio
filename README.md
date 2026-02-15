# automation-scenario-studio

CLI entrypoint for scenario execution and guidebook artifact generation.

## Overview

This package composes:

- `@metyatech/automation-scenario-renderer` for markdown and media outputs
- Robot Framework CLI for generated `.robot` suites

## Install

```bash
npm install @metyatech/automation-scenario-studio
```

## CLI

```bash
automation-scenario run-scenario --scenario ./automation/scenarios/web-example.scenario.json --output ./artifacts/web-example --markdown ./docs/controls/auto-web-example.md
```

Parameters:

- `--scenario` (required for `run-scenario`): scenario JSON path
- `--output` (optional): artifact directory override
- `--markdown` (optional): markdown output path override
- `--record-video` (optional): `true`/`false` for desktop recording in `run-scenario`

Scenario format:

- JSON schema repository: `metyatech/automation-scenario-spec`
- Supported targets: `web`, `unity`
- Supported actions: `open_url`, `click`, `drag`, `type`, `wait`, `shortcut`, `menu`, `keys`, `screenshot`

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
