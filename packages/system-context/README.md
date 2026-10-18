# @pidev/system-context

A script, not an extension. It dumps the system-context prompt Pi would build
for a project, so you can inspect how Pi assembles that prompt without starting
an interactive session or reading the project's files by hand.

The prompt is normally only visible from inside a running session. The
`pi-system-prompt-viewer` extension's `/system-context` command shows the same
thing, but it is TUI-only. This script reaches the same value through the SDK.

## Usage

```bash
# Dump the prompt for a project directory
node --experimental-strip-types dump.ts /path/to/project

# Or via npm from the monorepo root
npm run dump -w @pidev/system-context -- /path/to/project

# Default project is the current working directory
node --experimental-strip-types dump.ts
```

The prompt is written to stdout; diagnostics go to stderr. `--settle-timeout ms`
bounds how long the script waits for MCP servers to connect and register their
tools (default 15000).

## What it does

1. Creates a session rooted at the project, so Pi discovers that project's
   extensions, skills, context files and MCP servers.
2. Resolves project trust from Pi's trust store. The SDK's default resource
   loader leaves projects untrusted, which suppresses project-local MCP.
3. Binds extensions in TUI mode. Some extensions only contribute their direct
   tools to an interactive host; the MCP adapter is one.
4. Prints `session.systemPrompt`.

## Caveats

- A project must be trusted (in `~/.pi/agent/trust.json`) for its local MCP
  servers to appear. The script reads that store, it does not change it.
- Sections injected by an extension's `before_agent_start` handler, such as
  ponytail's `<ponytail>` section, only appear once an agent run starts. This
  script makes no model call, so those sections are absent.
- The script needs `@earendil-works/pi-coding-agent` to resolve at runtime. In
  this monorepo that is the root `devDependencies` copy; keep it matched to the
  Pi host you run.
