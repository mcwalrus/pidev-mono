# Changelog

## [Unreleased]

### Added

- `term-image` CLI: capture a tmux pane (`capture-pane -p -e`) and render it to a PNG via `@xterm/headless` + `canvas`.
- `captureTmuxPane` and `renderAnsiToPng` library functions, plus `paletteColor`.
- `term-image` skill so an agent can review TUI output as an image.
