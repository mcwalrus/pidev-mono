
**2026-10-17**

The problem is that there is no playwright MCP-like way to view the render output of a TUI session for pi.dev agents via the proposed solution afaik. It would be good if an agent can review this work themselves. Is this the case or is it possible within making edits and viewing within the same session?

The problem is that there is no way to observe the virtualised TUI when updating extensions to be tested specifically. Extensions and modules are loaded later can be tested interactively using `tmux` but aren't virtualised for the testing process and rely on an interactive user to validate any changes made through the process.

pi.dev development can validate the TUI experience via the `VirtualTerminal` backend which uses `@xterm/headless` to provide a cell-grid emulator of each character that appears on the screen. This is well documented where agents know how to edit TUI rendering via an interactive editing process. https://github.com/earendil-works/pi/blob/main/.pi/skills/interactive-testing.md

Two ways to view the extension's UI

Real TUI (highest fidelity). Run the built pi (or ./pi-test.sh -e ./ext.ts inside the monorepo) in tmux and read frames with tmux capture-pane -p, exactly as the interactive-testing skill does. This is the only route that exercises ctx.ui.custom(), overlays, widgets, footer/header, and the custom editor, because those need a real terminal.

Headless (deterministic). Mount the same component the extension hands to ctx.ui.custom(...) in a TuiMainScreen + VirtualTerminal and read getViewport(). That gives you the render loop from earlier, but for your extension's component. You lose the real app chrome but gain repeatability.






