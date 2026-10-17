# @pidev/checks

Environment precondition checks for Pi. Declare named shell probes once; they
run when a session starts and on demand, with a colour-coded aggregate beside
the editor.

The gap it closes: you find out a port is closed, a service is down, or a
credential does not resolve only when a tool or MCP server fails mid-session.
This surfaces the whole environment in one view before you start.

## Config

Config lives at `~/.config/pidev-checks/config.json` (honours `XDG_CONFIG_HOME`).
A project-local `.pi/checks/config.json` is checked first and, when present,
replaces the user-global config for that session.

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

Config resolution order: `$PWD/.pi/checks/config.json` first; if that file
does not exist, the user-global `~/.config/pidev-checks/config.json`. The first
file found wins — the two are not merged.

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
| `error` | The executor rejected (for example invalid spawn arguments). |

Colour contract: the widget and footer read **muted** while a run is in flight
(any result `pending` or `running`) and for an empty config; **green** only when
at least one check ran and every result is `passed`; **red** when any settled
result is `failed`, `timed_out`, or `error`. Startup therefore never flashes a
warning before a result exists. Once settled, the widget adds a bounded line
naming the checks that need attention.

## The `/checks` command

- `/checks` prints each check's name, state, duration, and exit code, the
  last-run time, and a bounded tail of any captured stdout/stderr. A non-passed
  check with no output still reports `no output captured (exit N)`, so a silent
  failure is diagnosable. The report is raised as an error when any check needs
  attention, and as info otherwise.
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

**Known limit.** `pi.exec` reports a command that cannot start (a missing
binary) as `{ code: 1, killed: false }` with empty output — identical to a
command that exited 1. There is no signal to tell them apart, so a missing
command shows `failed`, not `error`. `error` is reserved for an executor that
rejects (for example invalid spawn arguments).

## Testing

Co-located `*.test.ts` files use `@pidev/test-utils`. The check runner is a pure
function over an injected executor, so tests never spawn a process; the
lifecycle is driven through the `ExtensionAPI` mock.
