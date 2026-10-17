# Spec: `@pidev/self-help` — installed extension documentation advertisement

Status: ready-for-agent

## Problem Statement

When a Pi user installs an extension package, the Pi agent receives no documentation for it. The system prompt advertises every skill's name, description, and location, but not a single installed extension's documentation. The agent therefore treats extensions as opaque code and cannot answer "how do I configure `@x/y`?" or "what does this package expect?" without guessing or shelling out.

The gap is worse when configuration is required up front: the agent has no way to discover the setting, command, or format the package needs. The information is already on disk next to the installed package; nothing resolves it.

## Solution

A Pi extension that contributes a compact `extensions` section to the system prompt at agent start. The section advertises every installed npm-source package with its name, description, package location (the `package.json` path, not the module entry), and the resolved `README.md` path. The agent reads an extension's README with the ordinary `read` tool when the user asks about it. A `/self-help` command shows the same audit to the user in the terminal, including which packages have no resolvable README.

The extension injects **locations, not documentation content**: returning a path keeps third-party prose out of the prompt and lets the agent page through the README with the reader it already has. Prompt injection via README content is a stated, accepted risk of the follow-up where content is returned inline; it is not accepted here.

V1 resolves **managed npm installs only, for npm, pnpm, and Bun alike** — all three share one managed layout — across user and project scope, honouring `PI_CODING_AGENT_DIR`. It reads `package.json` for the description and location, and `README.md` only to confirm its presence. Legacy/global installs, git and local sources, and content extraction are out of scope (see Out of Scope and Further Notes).

## User Stories

1. As a Pi user, I want the system prompt to advertise my installed extension packages, so that the agent knows they exist before asking me.
2. As a Pi user, I want the advertisement to match how skills are already presented, so that the harness has one consistent story for contextual resources.
3. As a Pi agent, I want each installed extension's name, so that I can match the identifier the user gave me.
4. As a Pi agent, I want each installed extension's description, so that I can tell which package answers the user's configuration question.
5. As a Pi agent, I want each installed extension's package location (the `package.json` path), so that I can read its manifest when the README is not enough.
6. As a Pi agent, I want each installed extension's resolved README path, so that I can read the documentation with the ordinary `read` tool.
7. As a Pi agent, I want the README loaded on demand rather than injected, so that my prompt stays small and I only carry documentation I actually use.
8. As a Pi agent, I want packages with no resolvable README clearly marked, so that I tell the user rather than retry in a loop.
9. As a Pi agent, I want non-npm sources (git or local) absent from the advertisement, so that I do not claim a location the tool cannot resolve.
10. As a Pi agent, I want the advertised section to be stable for the session, so that the transcript delta Pi records does not churn every turn.
11. As a Pi agent in a compacted session, I want the advertisement re-derived from the live prompt sections, so that the extension list survives compaction.
12. As a Pi agent in a JSON or print session, I want the advertisement to work unchanged, so that non-interactive runs still know the installed extensions.
13. As a Pi user, I want my personal packages resolved under the configured agent directory (`PI_CODING_AGENT_DIR` honoured), so that a relocated harness advertises the correct README.
14. As a Pi user, I want project packages resolved under `.pi/npm/node_modules` relative to the session working directory, so that project-scoped installs advertise.
15. As a Pi user, I want the advertised set to reflect the effective merged settings, so that what the agent sees matches what Pi loaded.
16. As a Pi user who installs with pnpm or Bun, I want managed installs advertised the same as npm, so that my package manager choice does not silently hide documentation.
17. As a Pi user, I want project packages hidden until project trust is granted, so that an untrusted checkout cannot cause the extension to advertise arbitrary project paths.
18. As a security-conscious user, I want only `package.json` and `README.md` at a resolved package root ever read, so that a third-party package cannot use this extension to probe the filesystem.
19. As a security-conscious user, I want a package name that would escape the install root rejected, so that a malformed source string cannot traverse the filesystem.
20. As a security-conscious user, I want symlinked documentation refused, so that a package cannot point the agent at a file outside its own root.
21. As a Pi user, I want no README content placed in the system prompt, so that third-party prose cannot masquerade as harness instructions.
22. As a Pi user, I want the README content surface documented as a prompt-injection risk, so that a future content mode is a conscious decision.
23. As a Pi user, I want the `/self-help` command, so that I can audit what the agent was told without reading my settings.
24. As a Pi user, I want `/self-help` to name every installed package and whether it has documentation, so that I can install the missing README or ask for a follow-up.
25. As a Pi user, I want `/self-help` to work when the terminal has no UI, so that it degrades rather than throws.
26. As a Pi user, I want a malformed `packages` setting ignored rather than crashing the session, so that a typo never blocks startup.
27. As a Pi maintainer, I want the resolution logic to mirror the harness's own managed install rules, so that the advertisement does not drift and point at the wrong copy.
28. As a Pi maintainer, I want a single test seam at the extension boundary, so that the extension is exercised the way Pi calls it.
29. As a Pi maintainer, I want the extension to read and execute nothing from the package beyond its root files, so that installing an extension gains it no capability through this extension.
30. As a Pi user with two sessions open, I want each to resolve independently, so that neither interferes with the other.

## Implementation Decisions

- **New package** `@pidev/self-help`, lockstep version, `type: "module"`, `pi.extensions: ["./index.ts"]`, explicit `files`, a `ship-manifest.test.ts`, co-located tests. `@earendil-works/pi-coding-agent` and `typebox` are peer dependencies. `@pidev/config` is not required for V1 (no config file).
- **Modules.** A registration entry (wire the event handler and the command, no IO in the factory); a pure resolution module (settings sources to resolved packages); a prompt-section module (format the advertised block); a command module (the `/self-help` audit).
- **Discovery.** Call `pi.getSettings()` and read `packages` (`PackageSource[]` = `string | { source: string; ... }`). `getSettings()` returns the effective merged settings (global plus project, with overrides), so the advertised set matches what Pi loaded. Extract only the `source` field. Do not read the settings files directly.
- **Timing.** Resolve once on `session_start` (which supplies `ctx.cwd`) and keep the resolved list in extension-local memory. Rebuild the prompt section from that list on every `before_agent_start`. This keeps per-turn work to string formatting and gives a stable section the transcript diff can anchor to. A package installed mid-session is not advertised until the next `/reload`; `/self-help` re-resolves on demand and reports the current state.
- **Source parsing.** Recognise the `npm:` prefix. Parse the npm spec into `{ name, spec }`, supporting `name`, `name@version`, `@scope/name`, and `@scope/name@version`. A `git:`, URL, or local/path source is kept but omitted from the advertisement (no managed path exists). A source that parses to an unsafe name (empty, containing a path separator or `..`) is rejected and omitted.
- **Path resolution (managed, all package managers).** For a package `name`:
  - user scope root: `<agentDir>/npm/node_modules/<name>`
  - project scope root: `<cwd>/.pi/npm/node_modules/<name>`

  where `agentDir = getAgentDir()` (reads `PI_CODING_AGENT_DIR`, else `~/.pi/agent`) and `.pi` is `CONFIG_DIR_NAME`, both imported from `@earendil-works/pi-coding-agent`. npm, pnpm, and Bun managed installs all use this layout (`DefaultPackageManager.getManagedNpmInstallPath`); the package manager changes the install command, not the path, so no manager detection is needed. Resolve project first, then user, mirroring the harness's project-over-user precedence. Report every scope that exists, marking the project copy active.
- **Manifest read.** Read `package.json` at a resolved root once, for `name` and `description`. A missing or unreadable `package.json` still yields an advertisement carrying the source and the location, with the description omitted, because the package is installed.
- **README lookup.** Within a resolved root, find `README.md` case-insensitively (a case-folded `readdir`, no recursive walk), and confirm it is a regular file with `lstat` (reject symlinks and non-files). Confirm presence only; do not read its contents. Carry the resolved path. A package with no acceptable README is advertised with an explicit undocumented marker.
- **Advertised section.** Mirror `formatSkillsForPrompt`'s shape so the model reads it the same way. Section key `extensions`, containing a short usage sentence and the following structure:

```xml
<available_extensions>
  <extension>
    <name>@scope/name</name>
    <description>...</description>
    <location>/abs/path/package.json</location>
    <readme>/abs/path/README.md</readme>
  </extension>
  <extension>
    <name>@scope/undocumented</name>
    <location>/abs/path/package.json</location>
    <undocumented>No README.md at the package root.</undocumented>
  </extension>
</available_extensions>
```

- **Injection mechanism.** Register a `before_agent_start` handler that sets `event.systemPromptOptions.sections.extensions` to the formatted block. Mutating the sections object adds a tagged, independently replaceable section that Pi diffs into the transcript (the mechanism used by the `prompt-customizer` example and the `system-prompt-updates` tests), avoiding a full system-prompt replacement and the cache invalidation that follows. When there are no packages to advertise, the handler sets nothing and the prompt is unchanged.
- **Bounded section.** Cap the advertised block by bytes. If the cap is exceeded, list every package's name and location and append a truncation note pointing at `/self-help`, rather than dropping packages silently.
- **`/self-help` command.** No argument: resolve the current settings and emit one line per package — source, scope(s), installed path, and the README path or an undocumented marker — bounded by a byte cap. An argument (source or bare name): resolve that one package and report its package location and README path. The command reports locations, never README content. Guard output with `ctx.hasUI` so JSON and print sessions degrade rather than throw.
- **Undocumented notification.** The undocumented marker inside the advertised section is the agent-facing signal, and `/self-help` is the user-facing audit. No automatic startup notification is emitted.
- **Prompt-injection posture.** Only paths are injected; README content is not. The section header states the location of extension documentation, not its content. The follow-up content mode (returning or inlining README text) must record prompt injection as an accepted, explicit risk.
- **No cache of file contents.** `package.json` and the README presence are read fresh each resolution; nothing is persisted across sessions.
- **No model-callable tool.** The extension registers an event handler and a command, and no tool. The agent uses the built-in `read` tool on advertised paths.
- **No lifecycle work beyond resolution.** The factory registers the handler and command synchronously and starts nothing; resolution happens in `session_start` and holds no open handles.
- **Modes.** The extension uses `ctx.ui` only in the command, guarded by `hasUI`, so it works in interactive, RPC, JSON, and print modes.
- **No `@pidev/config` dependency.** V1 has no configuration file; scope roots come from the environment and the session.

## Testing Decisions

- **Good test.** Exercise the extension the way Pi calls it: build a real temporary directory tree, point `getSettings` at matching sources, invoke the captured `session_start` handler to populate resolution, then invoke the captured `before_agent_start` handler with a `systemPromptOptions` object and assert `sections.extensions`. Invoke the captured `/self-help` command handler and assert its output. Do not assert private helpers, call order, or field names that are not part of the advertised contract. Confinement and casing are asserted through the same boundary by placing candidate files in the temp tree.
- **One seam.** `createMockPi({ getSettings })` from `@pidev/test-utils`, plus real temp directories (mirroring `config/config.test.ts`, which uses a stubbed `HOME` and the real filesystem). No mocked `fs` module and no new seam. Capture `session_start`, `before_agent_start`, and the command through the mock's `captured.events` and `captured.commands`.
- **Prompt section.** Assert the formatted block contains each package's name, description, package location, and README path, and that an undocumented package carries the marker. Assert an empty package set leaves `sections.extensions` unset.
- **Cases.**
  - no packages leaves the prompt unchanged (no `extensions` section);
  - an npm package in string form advertises name, description, `package.json` location, and README path;
  - an npm package in object form (`{ source }`) is handled;
  - a `git:` or local source is omitted;
  - a bare and a scoped name both resolve, and `@scope/name@version` parses;
  - user scope resolves under the configured agent directory (stubbed `PI_CODING_AGENT_DIR`);
  - project scope resolves under `<cwd>/.pi/npm/node_modules`;
  - a package present in both scopes advertises the project copy as active;
  - a package with no README is advertised with the undocumented marker;
  - a lowercase `readme.md` is recognised;
  - a symlinked README is refused and reported undocumented;
  - a name containing `..` or a separator is rejected and omitted;
  - a malformed `packages` value does not throw;
  - the section exceeds the byte cap and degrades to names and locations with a truncation note;
  - `/self-help` with no argument lists every resolved package and its documentation state;
  - `/self-help <name>` reports that package's locations;
  - the command works with `hasUI: false`.
- **Manifest.** `ship-manifest.test.ts` using `verifyShipManifest`.
- **Prior art.** The harness's `claude-rules` example (scan on `session_start`, list paths in the prompt, agent reads them), `hello.register.test.ts` (capture registrations, invoke the handler), `config/config.test.ts` (temp/`HOME` handling), `checks/ship-manifest.test.ts`.

## Out of Scope

- **A model-callable tool.** No `extension_docs` tool; the agent uses `read` on advertised paths.
- **README content injection.** No README bytes in the system prompt and no inlining in the command. The content mode is a follow-up with prompt injection as a recorded risk.
- **git and local packages.** No managed node_modules path exists for them, so they are not advertised. Git installs live under `<scopeRoot>/git/<host>/<path>`, not `node_modules`.
- **Legacy and global installs.** V1 does not consult `npm root -g`, `bun pm bin -g`, pnpm's global store, or `getLegacyGlobalNpmInstallPath`. These require running package-manager commands and are a follow-up.
- **Package documentation other than `README.md`.** No `docs/` walk, no `USAGE.md`, no following links inside a README.
- **Windows-specific path handling** and case-insensitive filesystems beyond the README casing rule.
- **Temporary and `-e` packages.** They are not in settings and are not advertised.
- **Any package-gallery or registry lookup.** No network calls.
- **Caching, invalidation, or a watcher.**
- **Executing package code, scripts, or manifests.** The extension reads root files and nothing else.
- **Exposing the package's manifest resources** (commands, skills, prompts, themes) beyond what is already visible through `pi.getAllTools()` / `pi.getCommands()`.

## Further Notes

- **Package-manager runtimes are a non-issue for managed installs.** `DefaultPackageManager.getManagedNpmInstallPath()` returns the same path regardless of whether npm, pnpm, or Bun performs the install. Including Bun and pnpm in V1 is therefore free; what V1 still excludes is the legacy/global fallback, which differs per manager and needs a subprocess.
- **Why not reuse the harness resolver.** `DefaultPackageManager.listConfiguredPackages()` and `getInstalledPath()` already return `{ source, scope, filtered, installedPath? }` — the shape this extension wants — but they are not exposed through `ExtensionAPI`. `DefaultPackageManager`, `SettingsManager`, `getAgentDir`, and `CONFIG_DIR_NAME` are exported from the package root, so V1 imports `getAgentDir`/`CONFIG_DIR_NAME` and mirrors the managed path rules. If the harness later exposes a package-listing method, this extension should switch to it in one place.
- **SDK caveat.** `getAgentDir()` reads `PI_CODING_AGENT_DIR` and otherwise defaults to `~/.pi/agent`. An SDK embedder that passes a custom agent directory straight to the loader (not via the environment) will diverge from the advertised paths. This is the strongest argument for the harness API above.
- **Injection mechanism is a sanctioned extension point.** `before_agent_start` receives the live `systemPromptOptions`; assigning `sections.extensions` adds a replaceable, tagged section. Returning a whole `systemPrompt` would work too but replaces the prompt and can invalidate the cached prefix, so section mutation is preferred.
- **Trust.** Pre-trust, project settings load empty, so project packages simply do not appear; no extra gating is added. This is the same behaviour Pi itself has.
- **Prompt injection.** Advertising only README *paths* is the main mitigation: the extension never pulls third-party prose into the prompt. A malicious `description` line in `package.json` is a residual, bounded surface; the content mode would be a larger one.
- **Follow-up spec required for legacy/global roots.** Do not silently extend this package to cover them; write the follow-up spec first and note the resolver-selection rule there.
- Repo conventions apply: lockstep versions, no decision-code citations in `.ts`, co-located tests, `files` manifest with a ship check, no code comments beyond one-line why, no emojis.


# Later: Resolve extension docs inside the harness

Question: instead of shipping `@pidev/self-help` as an extension, should extension-documentation resolution be built into `pi-coding-agent` directly? Verdict: yes, it is the more correct home.

## Why?

- **The resolver already exists and is the exact shape the spec wants.**
- **It deletes the spec's main weakness: drift.**
- **It is strictly more correct on a known caveat.** 
- **It matches what skills already do.**
- **Coverage is free.**

I will spend some time validating this is no standalone extension. Once I'm happy with the results, I can pr-present it to maintainers. However, getting the correct format for the system prompt injection should be appropriate to do here. Once this is sufficient, I will raise with the maintainers myself.