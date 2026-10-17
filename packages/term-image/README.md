# @pidev/term-image

Agent-first terminal capture: a tmux pane in, a PNG out. Ships a CLI and a
[skill](./skills/term-image/SKILL.md) that tells an agent when to reach for it.

The gap it closes: an agent that edits TUI rendering has no built-in way to see
the result. `tmux capture-pane` gives text, which drops colour and attributes.
This renders the pane to an image the agent can read back and review in the same
session.

## How it works

```
tmux capture-pane -p -e        # ANSI with truecolor + attributes
  -> @xterm/headless           # parse into a cell grid
  -> canvas                    # rasterise each cell
  -> PNG
```

`tmux -e` is load-bearing: without escape sequences the grid would carry text but
no colour.

## Usage

```bash
node packages/term-image/cli.ts <tmux-target> <out.png>
```

Then read the PNG (an agent uses its `read` tool).

## Library

The entry point resolves under Pi's loader and under Vitest, which rewrite the
`.js` relative specifiers this repo uses. Plain `node` cannot: use the CLI there,
or import the module files directly (`./packages/term-image/render.ts`).

```ts
import { captureTmuxPane, renderAnsiToPng } from "@pidev/term-image";

const pane = captureTmuxPane("0");
const image = await renderAnsiToPng(pane.ansi, pane.cols, pane.rows);
```

- `captureTmuxPane(target, exec?)` — `tmux` size + screen; `exec` is injectable
  for tests.
- `renderAnsiToPng(ansi, cols, rows, options?)` — pure `ansi -> { png, width, height }`.
- `paletteColor(index)` — ANSI 0-255 to hex.

## Agent discovery

The skill is declared under `pi.skills` in `package.json`, so it loads when the
package is installed as a Pi package. To use the workspace copy during
development, add the local path to project settings:

```json
{ "packages": ["../packages/term-image"] }
```

## Limitations

- tmux only. cmux and macOS `screencapture` are not wired up.
- Visible pane only; no scrollback.
- Emoji and wide-glyph fidelity depends on available fonts.
- `canvas` is a native dependency; it needs a prebuilt binary or a working
  toolchain at install time.
