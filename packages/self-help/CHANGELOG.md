# Changelog

All notable changes to this package are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to lockstep versioning across the pidev-mono workspace.

## [Unreleased]

### Added

- Initial release: `@pidev/self-help` advertises installed npm extension
  packages in the system prompt.
- One byte-bounded `extensions` prompt section per agent start, advertising each
  package's name, manifest description, `package.json` location, and resolved
  `README.md` path, with an explicit undocumented marker when no README exists.
- Managed npm, pnpm, and Bun installs resolved across project and user scope,
  honouring `PI_CODING_AGENT_DIR`; both copies advertised with the project copy
  marked active.
- Confinement: only `package.json` and `README.md` at a resolved package root
  are read; traversal names and symlinked or non-regular README files are
  refused; git, URL, and local sources are omitted.
- `/self-help` audit command reporting every package's scope, installed path,
  and documentation state, with a per-package query form.
- Locations only — no README content enters the system prompt; prompt injection
  is recorded as an accepted risk of any future content mode.
