# @pidev/checks

Environment precondition checks for Pi. Declare named shell probes once; they
run when a session starts and on demand, with a colour-coded aggregate beside
the editor.

The gap it closes: you find out a port is closed, a service is down, or a
credential does not resolve only when a tool or MCP server fails mid-session.
This surfaces the whole environment in one view before you start.

## Config

Config lives at `~/.config/pidev-checks/config.json` (honours `XDG_CONFIG_HOME`):

```jsonc
{
	"checks": [
		{
			"name": "postgres",
			"command": "pg_isready",
			"args": ["-h", "127.0.0.1", "-p", "5432"],
			"timeoutMs": 5000
		},
		{
			"name": "dev-radius",
			"command": "node",
			"args": ["scripts/check-mcp.mjs"],
			"cwd": ".",
			"timeoutMs": 10000
		}
	]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Unique; shown in the widget and `/checks`. |
| `command` | yes | Executable, run **without a shell**. |
| `args` | no | Argument list passed to `command`. |
| `cwd` | no | Working directory; defaults to the session working directory. |
| `timeoutMs` | no | Per-check timeout; defaults to `10000`. |

A malformed config file warns and yields no checks rather than blocking startup.
An invalid entry warns and is skipped, leaving the rest intact.

## States

| State | Meaning |
| --- | --- |
| `pending` | Declared but not started. |
| `running` | In flight. |
| `passed` | Exited zero and was not killed. |
| `failed` | Exited non-zero. |
| `timed_out` | Killed by its timeout — a hang, not a failed assertion. |
| `error` | The command could not start (rejected executor). |

The widget reads green only when at least one check ran and every result is
`passed`. An empty config renders a neutral surface, not green.

## The `/checks` command

- `/checks` prints each check's name, state, and duration, the last-run time,
  and a bounded tail of any captured stdout/stderr.
- `/checks run` re-runs every check, refreshes the surfaces, then prints.
- Any other argument prints usage and runs nothing.

No background timer or periodic re-run; results refresh only on session start
and on `/checks run`.

## Behaviour

Checks run automatically on `session_start` **without blocking** the session.
Startup, `/checks run`, and shutdown are the only triggers. Every configured
check runs in a single pass, concurrently under a cap of four, and always
reports in config order.

Checks are **advisory and read-only**. The extension launches nothing except
the declared commands, owns no resources, and persists no logs or results
beyond the session. In-flight checks are cancelled on session shutdown, so no
probe outlives the session. With no UI (`ctx.hasUI` false) checks still run and
record results silently, so RPC, JSON, and print sessions work unchanged.

Each check kills only its own direct child, the same guarantee `pi.exec`
provides — a check that daemonises children can orphan them.

## Testing

Co-located `*.test.ts` files use `@pidev/test-utils`. The check runner is a pure
function over an injected executor, so tests never spawn a process; the
lifecycle is driven through the `ExtensionAPI` mock.
