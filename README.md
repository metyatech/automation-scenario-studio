# automation-scenario-studio

CLI entrypoint for scenario validation and execution.

## Overview

This package composes:

- `@metyatech/automation-scenario-runtime` for execution
- `@metyatech/automation-scenario-renderer` for markdown and media outputs
- `@metyatech/automation-scenario-spec` for schema validation

## Install

```bash
npm install @metyatech/automation-scenario-studio
```

## CLI

```bash
automation-scenario validate --scenario ./automation/scenarios/web-example.yaml
automation-scenario run --scenario ./automation/scenarios/web-example.yaml --output ./artifacts/web-example --markdown ./docs/controls/auto-web-example.md
```

Parameters:

- `--scenario` (required): scenario YAML path
- `--only` (optional): execute a single step by id
- `--output` (optional): artifact directory override
- `--markdown` (optional): markdown output path override

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
