# Changelog

All notable changes to this repository will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Changed

- Migrated scenario loading and validation to `schema_version: 2.0.0`.
- Updated Robot suite generation to consume v2 step model (`kind: action|group|control`) and flatten nested groups.
- Added profile/variable overrides to CLI execution:
  - `--profile <name>`
  - `--var key=value` (repeatable)
- Updated README with v2 action names and runtime override usage.
  n### Added

- `--asset-base-url` CLI flag for absolute URL paths in generated Markdown.
- Animation generation from scenario `outputs.animation` config (GIF/WebP via ffmpeg).
- `parseAnimationConfig()` helper for reading scenario animation settings.

### Fixed

- `screenshot_enabled` variable scoping: changed from `Set Variable` to `Set Suite Variable` in generated Robot suites.

## [0.1.0] - 2026-01-26

### Added

- Initial public release of automation-scenario-studio.
- CLI for running Robot Framework suites from automation-scenario-spec v2.
- Support for web and unity targets.
