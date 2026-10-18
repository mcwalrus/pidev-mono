# @pidev/system-context

Pi assembles a project's system prompt — context files, skills, extension
contributions, MCP tools — at session start, but that assembled prompt is only
visible from inside a running session. This package has two surfaces that make
it inspectable:

- a **script** that resolves an arbitrary project directory's prompt and writes
  it to a file, so a prompt can be captured, diffed, and checked in CI without
  starting an interactive session; and
- a **Pi extension** whose `/system-context` command opens a scrollable overlay
  of the current session's provider-neutral system footprint, and which can also
  capture another directory's prompt to a file.

No network calls, telemetry, or upload: prompt contents never leave the machine.
The script and tool only read the prompt through the Pi SDK and write to the
requested path.

## Script

```bash
# Write a project's prompt to a file
node --experimental-strip-types dump.ts /path/to/project --out prompt.txt

# Or via npm from the monorepo root
npm run dump -w @pidev/system-context -- /path/to/project --out prompt.txt

# Without --out the prompt goes to stdout
node --experimental-strip-types dump.ts

# Default project is the current working directory
node --experimental-strip-types dump.ts --out prompt.txt
```

```
dump [project-dir] [--out <file>] [--settle-timeout ms]
```

With `--out`, the exact prompt is written to that path (parent directories are
created recursively) and the path is printed to stdout. The path is resolved
against the current working directory. Without `--out`, the prompt goes to
stdout unchanged. Diagnostics always go to stderr, so redirection never mixes
them with the prompt. A failure exits non-zero and prints the reason to stderr.

`--settle-timeout ms` bounds how long the script waits for MCP servers to connect
and register their tools (default 15000).

### What the script does

1. Creates a session rooted at the project, so Pi discovers that project's
   extensions, skills, context files and MCP servers.
2. Resolves project trust from Pi's trust store. The SDK's default resource
   loader leaves projects untrusted, which suppresses project-local MCP. The
   script reads the store; it never changes it.
3. Binds extensions in TUI mode. Some extensions only contribute their direct
   tools to an interactive host; the MCP adapter is one.
4. Waits until the active tool count settles, then writes the prompt.

## Extension

### `/system-context`

With no arguments, opens a scrollable overlay of the current session's
provider-neutral system footprint: the exact assembled system prompt and the
active tools reduced to `name`, `description`, `parameters`, and
`constrainedSampling` when the runtime exposes it. Internal construction
metadata such as `sourceInfo` and separately appended `promptGuidelines` is not
shown as a field.

| Key             | Action                           |
| --------------- | -------------------------------- |
| `↑↓` / `k` `j`  | Scroll one line                  |
| `PgUp` / `PgDn` | Scroll one page                  |
| `Home` / `End`  | Jump to the top or bottom        |
| `c`             | Copy the footprint to the clipboard (OSC 52) |
| `Esc` / `q`     | Close the overlay                |

Copy holds only the semantic footprint, not the title, footer, or diagnostics.
The footprint is captured at agent start; if no run has started, it is built on
demand so the command still works.

```text
/system-context --out <file> [--dir <path>]
```

Writes a capture of the target directory (`--dir`, default the session working
directory) to `<file>` and notifies the written path. In non-TUI sessions (RPC,
JSON, print) the overlay is unavailable; the command notifies and returns rather
than throwing.

### Tool

The `system_context` tool lets the agent capture another directory's prompt to a
file. It takes optional `cwd` and `out`, defaults `cwd` to the session working
directory and `out` to `system-context.txt` in that directory, and returns the
absolute written path and byte size. A non-zero script exit becomes a clear
error result rather than a claimed capture.

## Caveats

- A project must already be trusted (in `~/.pi/agent/trust.json`) for its local
  MCP servers to appear in the captured prompt.
- Sections injected by an extension's `before_agent_start` handler, such as
  ponytail's `<ponytail>` section, only appear once an agent run starts. Neither
  surface makes a model call, so those sections are absent.
- The script needs the `@earendil-works` SDK tree to resolve at runtime, and
  every `@earendil-works` package must match the Pi host version. In this
  monorepo that is the root `devDependencies` copy; a mismatched transitive
  package leaves the SDK root unimportable, so keep the tree matched to the Pi
  host you run.

## Attribution

The overlay and footprint model are adapted from
[pi-system-prompt-viewer](https://github.com/eggmasonvalue/pi-system-prompt-viewer)
by **eggmasonvalue** (Apache-2.0). See [NOTICE](NOTICE) for the full attribution.

Changes from upstream:

- Only the provider-neutral System Footprint view is ported; the Provider
  Request view and the `before_provider_request` subscription were removed, so
  no provider payload is rendered or serialised.
- The upstream two-view overlay is reduced to a single system-footprint view.
- The viewer is integrated with this package's SDK dump script, so another
  directory's prompt can be captured to a file from the command and the tool.
