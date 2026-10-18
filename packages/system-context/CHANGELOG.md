# Changelog

All notable changes to this package are documented here.

## [Unreleased]

### Added

- Script: dump the system-context prompt Pi builds for a project via the SDK.
- Script: `--out <file>` writes the prompt to a target file, creating parent
  directories, with diagnostics on stderr and a non-zero exit on failure.
- Extension: `/system-context` opens a scrollable overlay of the current
  session's provider-neutral system footprint.
- Extension: provider-neutral tool descriptors (`name`, `description`,
  `parameters`, and `constrainedSampling` when exposed) in the footprint.
- Extension: `/system-context --out <file> [--dir <path>]` and a
  `system_context` tool capture another directory's prompt to a file.
- Attribution: Apache-2.0 `LICENSE` and `NOTICE` recording the adaptation from
  pi-system-prompt-viewer by eggmasonvalue.
