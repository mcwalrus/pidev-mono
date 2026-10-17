# Spec: `@pidev/checks` — environment precondition checks

Status: ready-for-agent

## Problem Statement

Before an agent session starts, a user needs to know whether the environment their tools depend on is actually ready — a port listening, a service answering, a credential resolving. Today they discover this mid-session when a tool or MCP server fails, with no single view of which precondition is broken and no way to re-check one without ad-hoc shell commands.

## Solution

A Pi extension that reads a list of user-authored check commands from `~/.config/pidev-checks/config.json`, runs them when a session starts and on demand, shows a colour-coded aggregate beside the editor, and provides a `/checks` command to inspect full output and re-run on demand.

## User Stories

1. As a Pi user, I want to declare checks in a config file, so that I do not retype the same shell commands every session.
2. As a Pi user, I want each check to be a named command with arguments, so that I can recognise which precondition failed.
3. As a Pi user, I want to set a working directory and a per-check timeout, so that a probe runs where it should and cannot hang forever.
4. As a Pi user, I want all configured checks to run automatically when a session starts, so that I see the environment state without asking.
5. As a Pi user, I want startup checks to run without blocking the session, so that a slow check does not delay my first prompt.
6. As a Pi user, I want a persistent widget beside the editor showing pass/fail, so that I can see health at a glance.
7. As a Pi user, I want the widget to read green only when every check passed, so that green is unambiguous.
8. As a Pi user, I want the widget to hint the command that shows detail, so that I know how to inspect failures.
9. As a Pi user, I want a `/checks` command that lists each check's name, state, and duration, so that I can see what ran.
10. As a Pi user, I want `/checks` to show captured stdout and stderr, so that I can diagnose a failure without re-running it.
11. As a Pi user, I want `/checks run` to re-run every check on demand, so that I can confirm a fix without restarting the session.
12. As a Pi user, I want the widget and the command to show when results were last produced, so that I know when they are stale.
13. As a Pi user, I want a check that exits non-zero shown as failed, so that the pass/fail contract is obvious.
14. As a Pi user, I want a check killed by its timeout shown as timed out, distinct from failed, so that I do not misread a hang as a failed assertion.
15. As a Pi user, I want a check that cannot start shown as an error, so that a bad command is distinct from a failing condition.
16. As a Pi user, I want every configured check to run even when an earlier one fails, so that one pass shows the whole picture.
17. As a Pi user, I want checks to be read-only probes that own no resources, so that closing a session is safe.
18. As a Pi user, I want in-flight checks cancelled on shutdown, so that no probe outlives the session.
19. As a Pi user, I want my checks in the XDG config location, so that they follow me across projects.
20. As a Pi user, I want a malformed config to warn and fall back to no checks, so that a typo never blocks startup.
21. As a Pi user, I want invalid check entries skipped with a warning, so that one bad entry does not disable the rest.
22. As a Pi user with two sessions open, I want each to run the shared config independently, so that neither interferes with the other.
23. As a Pi user in a non-interactive mode, I want checks to run without TUI calls, so that RPC, JSON, and print sessions still work.
24. As a security-conscious user, I want the extension to execute nothing except the declared checks, so that I can reason about what runs.
25. As a Pi user, I want the aggregate to stay neutral until a run settles, so that startup does not flash a problem that is not there.
26. As a Pi user, I want a settled run with any failure to read red, so that a broken precondition is unmistakable.
27. As a Pi user, I want the widget to name the checks needing attention, so that I can see which precondition is broken without running `/checks`.
28. As a Pi user, I want `/checks` output bounded by bytes as well as lines, so that one huge line cannot flood my view.
29. As a Pi user, I want a duplicate check name to warn, so that a copy-paste mistake is visible rather than silent.

## Implementation Decisions

- **New package** `@pidev/checks`, lockstep version, `type: "module"`, `pi.extensions: ["./index.ts"]`, explicit `files`, a `ship-manifest.test.ts`, co-located tests. `@pidev/config` is a dependency; `@earendil-works/pi-coding-agent` and `typebox` are peer dependencies.
- **Modules.** A registration entry (wire handlers, no process work in the factory); a config module (load + validate); a pure check runner that takes an executor function; a session-scoped result store.
- **Config loading.** `loadJsonConfigWithLegacyFallback("pidev-checks")`, then validate the `checks` array. File malformed → warn, expose zero checks. Entry invalid → warn, skip that entry. A duplicate `name` → warn once, keep both entries in config order.
- **Config schema** (decision-rich; `name` and `command` required, the rest optional):

  ```jsonc
  {
    "checks": [
      { "name": "postgres",   "command": "pg_isready", "args": ["-h", "127.0.0.1", "-p", "5432"], "timeoutMs": 5000 },
      { "name": "dev-radius", "command": "node", "args": ["scripts/check-mcp.mjs"], "cwd": ".", "timeoutMs": 10000 }
    ]
  }
  ```

  ```ts
  interface CheckDefinition {
    name: string;            // unique, shown in the widget and command
    command: string;         // executable, no shell
    args?: string[];
    cwd?: string;            // defaults to the session working directory
    timeoutMs?: number;      // defaults to 10_000
  }
  ```

- **Executor.** Every check runs through `pi.exec(command, args, { cwd, timeout, signal })`. The runner is a pure function over an executor with that signature, so tests inject a fake and never spawn anything. `code === 0 && !killed` → passed; `killed` → timed_out; non-zero → failed; a rejected executor → error. The runner must not assume `pi.exec` cleans up descendants — it kills only the direct child, so a check that daemonises children can orphan them.
- **Concurrency.** Checks run concurrently under a small cap (4). Results are stored in config order, and displayed in config order, so output is deterministic despite concurrency.
- **State shape:**

  ```ts
  type CheckState = "pending" | "running" | "passed" | "failed" | "timed_out" | "error";
  interface CheckResult {
    name: string;
    state: CheckState;
    code: number | null;
    durationMs: number | null;
    stdout: string;
    stderr: string;
    finishedAt: number | null;
  }
  ```

  Aggregate is `all-passed` only when at least one check ran and every result is `passed`; otherwise `attention`. Empty config renders a neutral surface, not green. Colour follows the aggregate: neutral (muted) while the store is empty or any result is `pending`/`running`; success (green) only when `all-passed`; error (red) for any settled `failed`, `timed_out`, or `error`.

- **Lifecycle.** `session_start` resets the store, renders the initial surface, and starts the run **without awaiting** it; the handler must not block startup. `session_shutdown` aborts the run's `AbortController` and clears the widget/status. The surface is refreshed as results land.
- **Surfaces.** `ctx.ui.setWidget()` for the aggregate plus the hint to run `/checks`, and, once settled, a bounded detail line naming the checks that are not passed; `ctx.ui.setStatus()` for the compact indicator. Rendering is gated on `ctx.hasUI`; non-interactive modes run checks silently.
- **Command.** `/checks` prints the latest results (name, state, duration, stdout/stderr tail bounded by both lines and bytes) and the last-run time; `/checks run` re-runs first, then prints. Unknown arguments print usage. No background timer and no periodic re-run.
- **Logs.** Full stdout/stderr are retained per check for the session in memory; the command prints a tail bounded by both lines and bytes, so a single huge line cannot flood the transcript. No file persistence.
- **No branch replay.** Results are session-scoped, not conversation state, so `hello`-style entry replay does not apply.

## Testing Decisions

- **Good test.** Drive external behaviour: given a config and a stubbed executor, assert the states the widget and command report and the cancellation on shutdown. Assert no private function, internal call order, or private field.
- **Modules tested.** Registration/lifecycle through the `ExtensionAPI` mock (widget, status, command output, abort on shutdown); config parse/validate as a pure unit; a contract-style test that the package's `pi` manifest and `files` are complete.
- **Seam.** `pi.exec` via `createMockPi({ exec })` from `@pidev/test-utils`. No new seam.
- **Prior art.** `hello.register.test.ts` (capture tools/commands/events, fire `session_start`, invoke handlers), `config/config.test.ts` (config path and fs under the stubbed HOME), `hello/ship-manifest.test.ts`.
- **Cases.** all-passed aggregate; mixed pass/fail; timed_out vs failed vs error distinguished; a failure does not stop later checks; `/checks run` re-invokes the executor and updates the surface; in-flight run aborted on `session_shutdown`; malformed config warns with zero checks; empty config renders neutral; duplicate names warn but both still run; neutral aggregate until a run settles; the widget names non-passed checks; two instances keep independent stores; `/checks run` aborts an in-flight run; `session_start` on `reload` re-runs.

## Out of Scope

- Launching, supervising, restarting, or killing background processes or process trees.
- Live or periodic change detection; polling; automatic mid-session re-checks.
- Project-local rules beyond a first-found `.pi/checks/config.json` (see ticket 06); no merge with the user-global config and no `project_trust` integration.
- An agent-facing tool exposing results; this is human-facing only in v1.
- Gating MCP connection or any other startup step on a check result.
- Cross-session or cross-terminal shared results.
- Persisting logs or results beyond the session; a structured stdout result schema.
- Portable process-group semantics beyond what `pi.exec` provides.

## Further Notes

- Two decisions defaulted because they were not resolved: (a) **no live mid-session change detection** in v1 — startup plus manual re-run only, with a last-run timestamp on the surface; (b) **user-global config only** in v1, because project-local checks are arbitrary code executed on clone. Ticket 06 overrides (b): a project-local `.pi/checks/config.json` is now checked first and wins when present.
- The original "run before the session starts, so the MCP server can connect" intent conflicts with hang safety. v1 is advisory and non-blocking; the MCP client connects in the background and retries, so a hard gate is not required. If a gate is wanted later it becomes a separate decision with a startup budget.
- Do not infer port state from MCP events. The check command does whatever handshake it needs; MCP disconnects only surface when something uses the server.
- Repo conventions apply: lockstep versions, no decision-code citations in `.ts`, co-located tests, `files` manifest with a ship check, no code comments beyond one-line why.
- Hardening pass (tickets 01-05) resolves the surface details v1 left loose: the colour contract above, the widget naming the checks needing attention, a byte-bounded output tail, a duplicate-name warning, and tests for the session-lifecycle guarantees. The two v1 defaults (no live mid-session detection; user-global config only) still stand.
- Ticket 08 supersedes the `/checks` (show) versus `/checks run` split: `/checks` now always re-runs, and a state change is carried into the next model prompt as a one-shot `before_agent_start` note.
- Ticket 07 closes a live gap in the failure path: a non-passed check now always reports its exit code, a silent check reports `no output captured (exit N)`, and the `/checks` report is raised as an error when anything needs attention.
- Not verified: whether `mcp_servers_change` fires on connection loss, and the exact `ctx.ui.setWidget` signature.
- Verified live (tmux + term-image, 2026-10-17): `ctx.ui.setWidget` takes `string[]`, and the surface/colour/command behaviour matches. Also verified that `pi.exec` resolves `{ code: 1, killed: false }` for a missing binary — identical to `exit 1` — so the `error` state is only reachable from a rejecting executor; a missing command shows `failed`. Documented as a known limit.
