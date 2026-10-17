---
name: term-image
description: Capture a tmux pane to a PNG so you can visually review TUI output. Use when you changed TUI rendering (pi-tui components, an extension's overlay/footer/widget) and need to see the result without a human looking at the terminal.
---

# term-image

Render another terminal session to an image, then read the image back. This is
the agent-first way to review TUI changes: no MCP server, no human in the loop.

## When to use

- You edited TUI rendering and want to see the frame: pi-tui components, an
  extension's `ctx.ui.custom()` overlay, footer, header, or widget.
- You have a tmux pane running the app under test and want a reviewable frame.

## Run

From the pidev-mono repo root:

```bash
node packages/term-image/cli.ts <tmux-target> <out.png>
```

- `<tmux-target>` — `session:window.pane`, for example `0` or `work:1.0`.
  Defaults to `0`. Find one with
  `tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_current_command}'`.
- `<out.png>` — output path. Defaults to `term-image.png`.

The command prints the absolute path it wrote.

## View

Read the PNG with the `read` tool. That image is the rendering to review — the
same thing a human would see in the pane.

## Caveats

- The pane must already be running under tmux. This tool does not launch the
  app; start it first (for example the interactive-testing skill's
  `tmux new-session` flow).
- Colour, attributes, and layout come through. Emoji and wide glyphs depend on
  the fonts `canvas` can find.
- Only the visible pane is captured; scrollback is not included.
