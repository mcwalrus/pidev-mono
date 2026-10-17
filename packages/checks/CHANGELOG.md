# Changelog

All notable changes to this package are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to lockstep versioning across the pidev-mono workspace.

## [Unreleased]

### Added

- Initial release: `@pidev/checks` runs user-declared environment precondition
  checks from `~/.config/pidev-checks/config.json`.
- Non-blocking `session_start` run, concurrent under a cap of four, reported in
  config order.
- Widget aggregate and footer status, green only when every check passed.
- `/checks` command to inspect results and `/checks run` to re-run.
- Distinct `passed`, `failed`, `timed_out`, and `error` states.
- Cancellation of in-flight checks on `session_shutdown`; silent run with no UI.
- Duplicate check names warn once; both entries still run in config order.

### Changed

- The aggregate and footer are neutral while a run is in flight, green only once
  a settled run has every check passed, red for any settled failure.
- The widget names the checks needing attention once a run settles.
- `/checks` output is bounded by bytes per stream as well as lines.

### Known limitations

- `pi.exec` reports a missing command identically to a non-zero exit, so a
  command that cannot start shows `failed`, not `error`.
