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

## [0.1.0] - 2026-01-26

### Added

- Initial public release of automation-scenario-studio.
- CLI for running Robot Framework suites from automation-scenario-spec v2.
- Support for web and unity targets.
