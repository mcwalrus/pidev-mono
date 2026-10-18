# pidev-mono

A monorepo of extensions for [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)  Pi Agent. Every package ships under the `@pidev/*` scope and is versioned in lockstep: one install, one release pipeline.

## Getting started

Requires Node >= 22 and npm >= 11. Bootstrap once:

```bash
just install
```

I use [`justfile`](https://github.com/casey/just).  Run `just` to see workspace helpers.

## Packages

| Package                                    | What it is                                                               | For   |
| ------------------------------------------ | ------------------------------------------------------------------------ | ----- |
| [`@pidev/checks`](packages/checks)         | Environment precondition checks beside the editor                        | User  |
| [`@pidev/self-help`](packages/self-help)   | Tells the agent which extensions are installed and where their docs live | Agent |
| [`@pidev/system-context`](packages/system-context) | Views the assembled system prompt in-session, and captures any project's prompt to a file | User + Agent |
| [`@pidev/term-image`](packages/term-image) | Captures a tmux pane to a PNG, plus a skill that says when to use it     | Agent |

### @pidev/checks

You usually discover a closed port, a down service, or a credential that does not
resolve only when a tool fails mid-session. This extension lets you declare named
shell probes once; they run at session start and on demand, with a colour-coded
aggregate in the widget and a `/checks` command to re-run them.

Config is a JSON file at `~/.config/pidev-checks/config.json`, or a project-local
`.pi/checks/config.json` which replaces it for that session. See the
[package README](packages/checks/README.md) for the schema and the check states.

### @pidev/self-help

Pi tells the model which skills exist, but not which extensions are installed.
This one closes the gap: it resolves the packages in Pi's effective settings and
adds an `extensions` section to the system prompt, so the agent knows a package
exists and where its README lives. It advertises **locations, not content** — the
agent reads the README with the ordinary `read` tool when asked. A `/self-help`
command shows the same audit to you.

### @pidev/system-context

Pi builds a project's system prompt only inside a running session. This package
makes it inspectable: a `/system-context` overlay shows the current session's
provider-neutral footprint, and the same command with `--out` — plus a
`system_context` tool — shells out to an SDK script that captures any project
directory's prompt to a file. The overlay is adapted from
[pi-system-prompt-viewer](https://github.com/eggmasonvalue/pi-system-prompt-viewer)
by eggmasonvalue (Apache-2.0); see the package [NOTICE](packages/system-context/NOTICE).

### @pidev/term-image

An agent editing TUI rendering has no way to see the result; `tmux capture-pane`
gives text, which drops colour and attributes. This captures the pane with ANSI
escape sequences, renders it through an `@xterm/headless` cell grid to a PNG, and
ships a skill that tells the agent when to reach for it. The CLI takes a tmux
target and an output path.

## Repository layout

```
pidev-mono/
├── packages/          — one directory per package (see below)
├── test/setup.ts      — repo-wide Vitest setup
├── scripts/           — release pipeline + repo guards
├── vitest.config.ts   — one Vitest runner over `packages/*/**/*.test.ts`
├── tsconfig.base.json — shared TS config (noEmit; packages publish raw .ts)
└── biome.json         — shared lint/format config
```

The folder `packages/` also holds packages that exist only to support development.

They are not part of the user-facing surface:

- **`hello`** — an example of the extension patterns a new package should copy.
- **`config`** — a small, stateless config I/O library shared by siblings.
- **`test-utils`** — private test fixtures (`"private": true`, never published).

**Build model**: `noEmit` everywhere. Packages publish raw `.ts`; Pi loads them
directly via the `pi` manifest field. There is no `dist/` and no per-package
tsconfig. This maybe subject to change.
