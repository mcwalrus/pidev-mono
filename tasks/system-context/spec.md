# Spec: `@pidev/system-context` — system-prompt extension and repeatable dump script

Status: implemented

## Problem Statement

Pi assembles a project's system prompt — context files, skills, extension contributions, MCP tools — at session start, and that assembled prompt is only visible from inside a running session. A developer debugging why a given project produces a given prompt must start an interactive session rooted in that project and inspect it there. They cannot inspect a different project's prompt from where they are, and they cannot capture the prompt into a file to diff it, review it in a PR, or run it in CI.

`@pidev/system-context` today is a script that reaches the prompt through the SDK and prints it to stdout. It can target another directory, but it has no output file, no tests, and no in-session surface. The upstream `pi-system-prompt-viewer` gives a good in-session TUI viewer but is TUI-only: it can only ever show the session it is loaded into, and it writes nothing to disk. Neither tool alone covers the whole job.

Because the in-session viewer would be a port of Apache-2.0 code, the redistribution also carries attribution obligations that are not yet met.

## Solution

`@pidev/system-context` becomes one package with two surfaces that share one purpose:

- A **repeatable SDK script** that resolves the assembled system prompt for an arbitrary project directory and writes it to a target output file (`--out`), so a prompt can be captured, diffed, and checked in CI without starting an interactive session.
- A **Pi extension** whose `/system-context` command renders the current session's provider-neutral system footprint in a scrollable TUI overlay, and which can invoke the script to capture another directory's prompt to a file.

The viewer is adapted from `pi-system-prompt-viewer` (eggmasonvalue, Apache-2.0). This package ships the upstream licence text, a `NOTICE` recording the upstream project and author, a statement of the changes made, and a credit line in the README. No provider-payload view is ported: this version shows the provider-neutral system footprint only.

## User Stories

1. As a Pi developer debugging a project's harness config, I want to capture that project's assembled system prompt to a file, so that I can read it outside Pi.
2. As a Pi developer, I want to target a project directory other than my current one, so that I can inspect a configuration I am not sitting in.
3. As a Pi developer, I want the capture to be repeatable with the same command and arguments, so that a before/after diff is stable.
4. As a Pi developer, I want diagnostics (trust, MCP settling, failures) on stderr while the prompt goes to the file, so that redirection never mixes them.
5. As a Pi developer, I want the output file's parent directories created if missing, so that a fresh output path just works.
6. As a Pi developer, I want a non-zero exit code and a clear message when resolution fails, so that a CI step fails loudly rather than writing an empty file.
7. As a CI author, I want to run the dump for a fixture project and compare the file against a committed baseline, so that a harness change that alters the prompt is caught.
8. As a Pi user, I want `/system-context` to open a viewer for my current session's provider-neutral system footprint, so that I can see the prompt Pi actually built without leaving Pi.
9. As a Pi user, I want the exact assembled prompt string with its real line breaks and paragraph structure, so that the view is faithful and not a re-serialisation.
10. As a Pi user, I want to see the active tools reduced to provider-visible semantics (name, description, parameters), so that the view shows what the provider sees and not internal construction metadata.
11. As a Pi user, I want to scroll and page through a long footprint, so that I can read past the viewport.
12. As a Pi user, I want to copy the footprint to my terminal clipboard, so that I can paste it elsewhere without `--out`.
13. As a Pi user, I want copy and view labels clearly excluded from the copied text, so that the clipboard holds only the semantic footprint.
14. As a Pi user, I want to toggle nothing I did not ask for — one view, close with Esc or q — so that the overlay stays simple.
15. As a Pi user, I want `/system-context --out <file> [--dir <path>]` to write a capture and report the path, so that I can use the same command for the file workflow.
16. As a Pi agent, I want a model-callable tool to capture another directory's prompt to a file and return the path, so that I can answer "what prompt would this project build?".
17. As a Pi agent, I want the tool to return the written path and byte size, so that I can read it with the ordinary `read` tool or pass it on.
18. As a Pi agent, I want the tool to default the target directory to the session cwd and the output to a predictable filename, so that the common case needs no arguments.
19. As a Pi agent, I want the tool to report script failures as a clear error, so that I do not claim a capture that did not happen.
20. As a Pi user in a non-TUI session (RPC, JSON, print), I want the command to notify and degrade rather than throw, so that it never breaks a run.
21. As a Pi user, I want the footprint captured at agent start, after Pi has assembled the prompt, so that the view is coherent for that run.
22. As a Pi user, I want the viewer to build the footprint on demand if no run has started yet, so that `/system-context` still works before the first turn.
23. As a Pi user, I want the view to wrap long lines to the terminal width without breaking ANSI attributes, so that the overlay renders correctly.
24. As a security-conscious user, I want the script and tool to only read the prompt through the SDK and write to the requested path, so that this package gains no capability beyond inspecting a prompt.
25. As a security-conscious user, I want no network calls, telemetry, or upload, so that prompt contents never leave the machine.
26. As a licensing-conscious maintainer, I want the upstream Apache-2.0 licence text shipped with the package, so that redistribution is compliant.
27. As a licensing-conscious maintainer, I want a `NOTICE` naming the upstream project, author, and URL, and a statement of the changes made, so that the attribution obligation is discharged in the form Apache-2.0 expects.
28. As a licensing-conscious maintainer, I want the ported modules to carry a short attribution header, so that a file lifted out of context still names its origin.
29. As a Pi developer, I want the README to credit the upstream author and state what changed, so that a reader knows the lineage of the viewer.
30. As a Pi maintainer, I want the script's argument parsing and output writing behind an injectable seam, so that script tests never create a real session.
31. As a Pi maintainer, I want the viewer's rendering behind a pure function, so that its layout is testable without a real terminal.
32. As a Pi maintainer, I want the packaged files to be verified by a ship-manifest test, so that the licence and notice cannot be omitted from the tarball.

## Implementation Decisions

- **One package, two surfaces.** `@pidev/system-context` ships both the script entry and the extension entry. It gains a `pi.extensions` manifest entry pointing at the extension entry. Lockstep version, `type: "module"`, raw-TypeScript publishing, co-located tests, explicit `files` array, ship-manifest test. `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` are peer dependencies; the viewer uses the TUI helpers, the script uses the SDK.
- **Modules.**
  - The **script entry** resolves the prompt through the SDK for a target directory and writes it out; it stays importable (exports for tests) and gains an injectable main.
  - The **extension entry** registers the command, the tool, and the `agent_start` capture; the factory does no IO.
  - A **footprint model** module, pure and side-effect free: the provider-neutral content shape, the `toProviderNeutralTool` reduction, and the structure-preserving renderer for tool descriptors.
  - An **overlay** module: the TUI component plus a pure render function it delegates to.
  - A **script invocation** module: locates the script from the package URL and runs it with `pi.exec`.
- **Script contract.** `dump [project-dir] [--out <file>] [--settle-timeout ms]`, defaulting the project directory to the process cwd. With `--out`, the prompt is written to that path (resolved against cwd, parent directories created recursively) and the path is printed to stdout; without `--out`, the prompt goes to stdout, preserving today's behaviour. Diagnostics go to stderr. A failure sets a non-zero exit code and prints the reason to stderr.
- **Resolution behaviour is preserved.** The script keeps its current steps: create a session rooted at the target project, resolve project trust from Pi's trust store (project-local MCP is suppressed otherwise), bind extensions in TUI mode (some extensions contribute tools only to an interactive host), and poll until the active tool count settles within `--settle-timeout`. The script reads the trust store; it never writes it.
- **Extension command.** `/system-context` with no arguments opens the overlay for the current session. `/system-context --out <file> [--dir <path>]` shells out to the script for the target directory, writes the file, and notifies the written path. The command is TUI-only for the overlay; in non-TUI modes it notifies and returns.
- **Model-callable tool.** A single tool (name to be confirmed during implementation) takes optional `cwd` and `out`. Defaults: `cwd` is the session cwd, `out` is a predictable filename in that directory. It invokes the script through the injected `pi.exec`, returns the absolute written path and byte size, and returns a clear error result if the script exits non-zero. It is the only tool the package registers.
- **Capture timing.** On `agent_start` the extension snapshots the provider-neutral footprint: the string from `ctx.getSystemPrompt()` and the active tools reduced from `pi.getAllTools()` filtered to `pi.getActiveTools()`. The overlay uses that snapshot; if none exists (no run yet), it builds one on demand.
- **Provider-neutral reduction.** A tool descriptor carries only `name`, `description`, `parameters`, and `constrainedSampling` when the runtime object genuinely exposes it. `sourceInfo` and separately appended `promptGuidelines` are not included as independent fields; guideline text that genuinely occurs inside the assembled prompt stays because removing it would make the prompt inaccurate. Parameter schemas stay structurally faithful.
- **Overlay.** A single view titled for the system footprint, with real line breaks, ANSI-aware wrapping to the content width, a bordered box, a scroll-range footer, scroll keys (`up`/`k`, `down`/`j`, `pageUp`, `pageDown`, `home`, `end`), copy (`c`, OSC52 to the terminal clipboard, excluding labels and footer), and close (`Esc`/`q`). No tab switching. Copy holds only the semantic sections.
- **Licence and attribution.** Add a package-level `LICENSE` containing the Apache-2.0 text, and a `NOTICE` naming `pi-system-prompt-viewer`, its author (eggmasonvalue), and its repository URL, stating that `@pidev/system-context` adapts it and listing the material changes (single-view port; integration with the SDK script; removal of the provider-request view). List both in `files` so they ship. Put a one-line attribution header on each ported source module. Add a credit line and a short "changes from upstream" note to the README.
- **No matching of `before_provider_request`.** The provider payload view is not ported; the extension does not subscribe to that event and does not serialise provider payloads.
- **No config file.** The script's flags are the only configuration; nothing is read from `.pi/` or the agent directory for this feature.
- **No persistence.** The script writes only the requested output file. The extension holds the footprint snapshot in memory for the session.

## Testing Decisions

- **What makes a good test.** Exercise each surface the way its caller does, at the highest seam, without touching a real SDK session or a real terminal. Assert external behaviour — written file contents and path, stdout/stderr split, exit status, registered command/tool/event wiring, the arguments handed to `pi.exec`, the copied and rendered text, and the shape of the provider-neutral descriptors — not private helper call order.
- **Script.** Test the script entry's injectable `main(argv, deps)` where `deps` supplies the prompt producer and the writer, mirroring `term-image`'s injectable CLI dependencies. Assert: `--out` writes the prompt to the target path and returns it with stdout bounded to the path; no `--out` sends the prompt to stdout; argument parsing handles a positional project directory, `--out`, and `--settle-timeout`; a failing producer yields a non-zero result and a stderr reason; parent directories are created. Use real temp directories (`fs.mkdtemp` + cleanup), as the self-help and config tests do.
- **Extension wiring.** Use `createMockPi` and `createMockCommandCtx` from `@pidev/test-utils`, and capture the command, the tool, and the `agent_start` handler. Assert the tool and command are registered, the `agent_start` handler builds the footprint, the tool invokes `pi.exec` with the script path, target directory, and `--out`, and that a non-zero exec produces an error result. Prior art: `hello.register.test.ts`, `self-help.test.ts`, and `checks`' runner test's `pi.exec` assertions.
- **Footprint model.** Pure-function tests, adapted from upstream's `footprint-model.test.ts`. Assert the provider-neutral descriptor keeps only the permitted fields (and `constrainedSampling` only when present), that the renderer keeps multiline strings multiline and preserves structure, and that section labels are not treated as fields.
- **Overlay rendering.** Test the pure render function with the test-utils theme and a mock TUI: wrapping and padding to width, scroll-offset clamping at both ends, empty-content behaviour, and that the copied text excludes the footer and labels. Prior art is thin — no existing TUI-render test — so this is the package's one new seam. Manual smoke via the `term-image` skill after TUI changes.
- **Licence and packaging.** The ship-manifest test proves `LICENSE` and `NOTICE` are listed and present. An attribution test reads `NOTICE` and asserts it names the upstream project, author, and URL.
- **Cases.** `--out` file written; `--out` parent dirs created; stdout-only mode; `--settle-timeout` parsed and defaulted; failing producer exits non-zero; tool defaults `cwd`/`out`; tool passes explicit `cwd`/`out`; tool surfaces exec failure; command notifies (not throws) with no UI; footprint descriptor drops `sourceInfo` and `promptGuidelines`; `constrainedSampling` included only when present; multiline tool strings render as lines; overlay clamps scroll; copy excludes chrome.

## Out of Scope

- **The Provider Request view and `before_provider_request`.** Not subscribed, not rendered, not serialised.
- **Byte-for-byte HTTP capture.** Headers, transport encoding, compression, and SDK/network behaviour remain unavailable.
- **A JSON output mode, diffing, or watching.** The script writes prompt text only; callers diff files themselves.
- **A configuration file.** No persisted settings for target directories or output paths.
- **An in-process SDK session inside the extension.** Another directory is reached by shelling out to the script, not by nesting a second session in the host.
- **Changing Pi's trust store.** The script reads it; it does not grant trust.
- **Automatic startup notifications.** Capture is on demand only.
- **Sections injected by `before_agent_start` handlers, such as ponytail's.** They appear only during a model run, and neither surface makes a model call.
- **Windows-specific path handling.**

## Further Notes

- **Node version.** Shelling out relies on `node --experimental-strip-types`, so the host Node must be >= 22, which the repo already requires. The script is shipped as raw TypeScript like every sibling.
- **Trust caveat is unchanged.** A target project must be already trusted for its project-local MCP servers to appear in the captured prompt. This is the same behaviour the script has today and is stated in the README.
- **No NOTICE upstream.** `pi-system-prompt-viewer` ships Apache-2.0 with no `NOTICE` file, so nothing is inherited to copy; our `NOTICE` is the attribution record and must name the upstream explicitly.
- **Apache-2.0 §4 obligations.** Retain the licence and copyright notices, state significant changes, and include the licence text with the distribution. The package-level `LICENSE`, the `NOTICE`, the source headers, and the README credit collectively discharge these; they must stay in the `files` array so a published tarball carries them.
- **Keep the ported viewer small.** Only the system-footprint view is needed, so the upstream class shrinks to one mode. If the port later grows toward the full two-view viewer, revisit the attribution scope.
- **File-size ratchet.** New source files under `packages/` must fit the new-file cap; split the overlay rather than approaching it.
- **Repo conventions apply.** Lockstep versions, host-provided peer dependencies, raw-TypeScript publishing, co-located tests, a ship-manifest test, no decision-code citations in `.ts`, no emojis.
