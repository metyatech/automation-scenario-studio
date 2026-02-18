# automation-scenario-studio

CLI/runtime package for:

- loading `automation-scenario-spec` v2 scenarios
- generating Robot Framework suites from scenario steps
- executing Robot and generating markdown + annotated images/videos

## Overview

This package composes:

- `@metyatech/automation-scenario-renderer` for markdown/media outputs
- Robot Framework CLI for generated `.robot` suites

## Install

```bash
npm install @metyatech/automation-scenario-studio
```

## CLI

```bash
automation-scenario run-scenario --scenario ./automation/scenarios/web-example.scenario.json --output ./artifacts/web-example --markdown ./docs/controls/auto-web-example.md

# profile + variable override
automation-scenario run-scenario --scenario ./automation/scenarios/unity.scenario.json --profile docs --var unity_window_hint=Unity --var menu_path=Tools/Build
```

Parameters:

- `--scenario` (required for `run-scenario`): scenario JSON path
- `--output` (optional): artifact directory override
- `--markdown` (optional): markdown output path override
- `--record-video` (optional): `true`/`false` for desktop recording in `run-scenario`
- `--profile` (optional): profile name from scenario `profiles`
- `--var` (optional, repeatable): runtime variable override in `key=value` format

Scenario format:

- JSON schema repository: `metyatech/automation-scenario-spec`
- Supported schema version: `2.0.0`
- Supported targets for Robot generation: `web`, `unity`
- v2 action steps:
  - web: `open_url`, `click`, `drag_drop`, `type_text`, `wait_for`, `press_keys`, `screenshot`
  - unity: `click`, `drag_drop`, `type_text`, `wait_for`, `press_keys`, `open_menu`, `screenshot`
- v2 `control` steps are preserved in spec, but Robot export fails fast on unsupported control actions.

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

## Release

This package is published to npm under the `@metyatech` scope.

1. Ensure all changes are documented in `CHANGELOG.md`.
2. Bump the version in `package.json`.
3. Run `npm run verify`.
4. Create a Git tag and push to GitHub.
5. A GitHub Release will be created, and the package will be published via CI.

## Links

- LICENSE: `LICENSE`
- SECURITY: `SECURITY.md`
- CONTRIBUTING: `CONTRIBUTING.md`
- CHANGELOG: `CHANGELOG.md`
