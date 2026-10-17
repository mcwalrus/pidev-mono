# @pidev/self-help

Advertises installed Pi extension packages to the agent. Pi already tells the
model which skills exist, with a name, a description, and a file path. It does
not do the same for extensions, so the agent treats an installed package as
opaque code and cannot answer "how do I configure `@x/y`?" without guessing.

This extension closes that gap. It resolves the npm packages declared in Pi's
effective settings, contributes a compact `extensions` section to the system
prompt, and adds a `/self-help` command that shows the same audit to the user.

It advertises **locations, not documentation content**. The agent reads a
package's README with the ordinary `read` tool when the user asks about it.
Nothing from a README ever enters the system prompt.

## The advertised section

On every agent start the extension sets the `extensions` prompt section. Pi
wraps each section in a tag of the same name, so the model sees:

```xml
<extensions>

The following extensions are installed.
Read an extension's README with the read tool when the user asks about it.

<available_extensions>
  <extension>
    <name>@scope/name</name>
    <description>What the package does.</description>
    <location>/abs/path/package.json</location>
    <readme>/abs/path/README.md</readme>
  </extension>
  <extension>
    <name>@scope/undocumented</name>
    <location>/abs/path/package.json</location>
    <undocumented>No README.md at the package root.</undocumented>
  </extension>
</available_extensions>
</extensions>
```

- `<name>` is the npm package name: the `npm:` prefix and any version range are
  stripped.
- `<description>` is copied from the package's `package.json`. It is omitted
  when the manifest is missing or has no description; the package is still
  advertised because it is installed.
- `<location>` is always the `package.json` path, never the module entry.
- `<readme>` is the resolved `README.md` path, or `<undocumented>` when no
  acceptable README exists at the package root.
- `<active>true</active>` is added to the copy Pi loads when the same package
  exists in more than one scope (see below).

The block is capped by bytes. When the cap is exceeded it degrades to every
package's name and location plus a truncation note pointing at `/self-help`;
packages are never dropped silently.

Resolution happens once on `session_start` and the result is held in
extension-local memory, so the section is stable for the session and the
transcript delta does not churn. A package installed mid-session appears after
`/reload`. No README content is cached.

## Scope resolution

Only **managed npm installs** are resolved. npm, pnpm, and Bun share one managed
layout (`DefaultPackageManager.getManagedNpmInstallPath`), so the package
manager changes the install command, not the path — all three are covered
without manager detection.

For a package `name`, the extension checks:

| Scope | Root |
| --- | --- |
| project | `<cwd>/.pi/npm/node_modules/<name>` |
| user | `<agentDir>/npm/node_modules/<name>` |

`<agentDir>` comes from `getAgentDir()`: `PI_CODING_AGENT_DIR` when set,
otherwise `~/.pi/agent`.

Project is resolved before user, mirroring Pi's precedence. When the same
package exists in both scopes, both copies are advertised and the project copy
is marked `<active>true</active>`.

The advertised set comes from `pi.getSettings().packages` — the effective merged
settings — so it matches what Pi loaded. Before project trust is granted,
project settings load empty and project packages simply do not appear; no extra
gating is added. A malformed `packages` value is ignored rather than crashing
the session.

## Security posture

- Only two files are ever read at a resolved package root: `package.json` (for
  the name and description) and `README.md` (to confirm its presence). No
  recursive walk, no `docs/`, no other file.
- A README is accepted only when it is a case-insensitive `README.md` match
  (`readme.md` works) and a regular file. A symlink or a directory named
  `README.md` is refused and reported undocumented, so a package cannot point
  the agent at a file outside its own root.
- A source or name containing `..` or a path separator is rejected before any
  path is joined, so a malformed source string cannot traverse the filesystem.
- Repository code is never executed, and the package's scripts and manifests
  are never run.
- Nothing is read from the package beyond those root files, so installing an
  extension gains it no capability through this extension.

## Prompt-injection risk

Advertising only a README **path** is the main mitigation: third-party prose
never enters the prompt. A malicious `description` line in `package.json`
remains a residual, bounded surface.

Any follow-up that returns or inlines README content — for example an
`extension_docs` content mode — carries **prompt injection as an accepted,
explicit risk**: a README can contain text crafted to look like harness
instructions. That mode must be a conscious decision, not a silent extension of
this one.

Out of scope for V1:

- **Legacy and global installs.** npm's global root, `bun pm bin -g`, pnpm's
  global store, and `getLegacyGlobalNpmInstallPath` are not consulted; they need
  package-manager subprocesses. A follow-up spec should cover them before this
  package is extended.
- **git and local sources.** No managed `node_modules` path exists for them, so
  they are omitted from the advertisement rather than given a manufactured
  location.
- **README content.** No content is returned by the prompt section or the
  command. The agent uses `read` on the advertised path.
- **Any package-gallery or registry lookup.** No network calls.
- **Package documentation other than `README.md`.**

## The `/self-help` command

`/self-help` shows the user the same audit the agent was given, re-resolving the
current settings at invocation so it reflects changes since session start:

```
npm:@scope/name
  project: /repo/.pi/npm/node_modules/@scope/name/package.json
    README /repo/.pi/npm/node_modules/@scope/name/README.md
  user: /home/me/.pi/agent/npm/node_modules/@scope/name/package.json
    undocumented (no README.md at the package root)
```

`/self-help <source|name>` reports the matching package's `package.json`
location and README path. The command reports locations and never README
content, and its output is bounded by a byte cap. With no UI (`hasUI` false) it
degrades silently rather than throwing, so RPC, JSON, and print sessions work.

The extension registers an event handler and a command only — no
model-callable tool.

## Testing

Co-located `*.test.ts` files exercise the extension through the harness
boundary: a mock Pi with a stubbed `getSettings`, real temporary directory
trees, and the captured `session_start` / `before_agent_start` handlers and
`/self-help` command. `ship-manifest.test.ts` proves the npm tarball ships every
production module.
