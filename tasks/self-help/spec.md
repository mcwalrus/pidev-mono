# Spec: `@pidev/self-help` — extension documentation lookup

Status: ready-for-agent

## Problem Statement

When a Pi user installs an extension package, the Pi agent receives no documentation for it. The system prompt advertises Pi's own docs and every skill's location and description, but not a single installed extension's README. The agent therefore treats extensions as opaque code and cannot answer "how do I configure `@x/y`?" or "what does this package expect?" without guessing or shelling out.

The gap is worse when configuration is required up front: the agent has no way to read the package's README, so it cannot discover the setting, command, or format the package needs. The information is already on disk next to the installed package; nothing resolves it.

## Solution

A Pi extension that gives the agent a tool, `extension_docs`, which resolves an installed extension's `README.md` from disk. With no argument it lists installed npm packages with their documentation paths and scopes; with a source or package name it returns that package's README.

V1 resolves **npm packages only**, across both user and project scope, honouring `PI_CODING_AGENT_DIR`. It reads exactly one file, `README.md` at the package root. git, local, pnpm, and Bun installs are recognised but not resolved in V1 (see Out of Scope and Further Notes).

## User Stories

1. As a Pi agent, I want a tool that lists installed extension packages, so that I can discover what documentation is available before asking the user.
2. As a Pi agent, I want each listed package's resolved README path, so that I can read it with the ordinary file reader if I need the raw file.
3. As a Pi agent, I want to request a package's documentation by its source string (`npm:@x/y`), so that I can use exactly the identifier the user gave me.
4. As a Pi agent, I want to request a package's documentation by its bare name (`@x/y`), so that I do not have to remember the `npm:` prefix.
5. As a Pi agent, I want a scoped package name to resolve correctly (`@scope/name`), so that the majority of published packages work.
6. As a Pi agent, I want a name that matches more than one installed source reported as ambiguous, so that I choose deliberately rather than get an arbitrary copy.
7. As a Pi agent, I want a package that is installed but has no README reported distinctly, so that I do not retry in a loop.
8. As a Pi agent, I want a package that is not installed reported distinctly, so that I can tell the user it is absent.
9. As a Pi agent, I want a non-npm install (a git or local source) reported as unsupported rather than as absent, so that I understand the limitation instead of asserting the package does not exist.
10. As a Pi agent, I want the README truncated to a byte budget with the file path included, so that one large README does not flood my context and I can still read the rest.
11. As a Pi agent, I want the tool result to carry structured details (source, scope, path), so that programmatic callers and renderers get provenance without parsing prose.
12. As a Pi agent, I want the documentation read from disk on every call, so that a package upgraded mid-session does not return a stale README.
13. As a Pi agent in a JSON or print session, I want the tool to work unchanged, so that non-interactive runs can still research installed packages.
14. As a Pi user, I want my personal packages read from the configured agent directory (`PI_CODING_AGENT_DIR` honoured), so that a relocated harness resolves the correct README.
15. As a Pi user, I want project packages read from `.pi/npm/node_modules` under the session working directory, so that project-scoped installs resolve.
16. As a Pi user, I want a package installed in both scopes to report the active (project) copy as active, so that the documentation I get matches what is loaded.
17. As a Pi user, I want project packages hidden until project trust is granted, so that an untrusted checkout cannot cause my tool to read arbitrary project files.
18. As a security-conscious user, I want the tool to read only `README.md` at a resolved package root, so that a third-party package cannot use this tool to exfiltrate arbitrary files.
19. As a security-conscious user, I want a package name that would escape the install root rejected, so that a malformed source string cannot traverse the filesystem.
20. As a security-conscious user, I want symlinks and non-regular files refused, so that the read cannot be redirected outside the package.
21. As a security-conscious user, I want the tool declared read-only, so that a permission extension can reason about it without inspecting the code.
22. As a Pi user, I want the tool to read and execute nothing from the package, so that installing an extension does not gain it any new capability through this tool.
23. As a Pi user, I want no README injected into the system prompt automatically, so that the first turn stays small and prompt injection from package docs is not amplified.
24. As a Pi user, I want a malformed `packages` setting ignored rather than crashing the session, so that a typo never blocks startup.
25. As a Pi user, I want the listing to reflect the effective merged settings, so that what I am told matches what Pi will load.
26. As a Pi user with two sessions open, I want each to resolve independently, so that neither interferes with the other.
27. As a Pi maintainer, I want the resolution logic to mirror the harness's own install rules, so that the tool does not drift and return the wrong copy.
28. As a Pi maintainer, I want a single test seam at the extension boundary, so that the tool is exercised the way Pi calls it.
29. As a Pi agent, I want the tool's no-argument listing to be the discovery path named in its description, so that I know to call it without arguments first.
30. As a Pi agent, I want multiple README casings (`README.md`, `readme.md`) resolved, so that a package that uses lowercase does not appear undocumented.

## Implementation Decisions

- **New package** `@pidev/self-help`, lockstep version, `type: "module"`, `pi.extensions: ["./index.ts"]`, explicit `files`, a `ship-manifest.test.ts`, co-located tests. `@earendil-works/pi-coding-agent` and `typebox` are peer dependencies. `@pidev/config` is not required for V1 (no config file).
- **Modules.** A registration entry (wire the tool, no IO in the factory); a pure resolution module (settings sources to resolved packages); a docs module (locate and read `README.md` under a resolved root, with confinement); a tool module (schema, description, result formatting).
- **Discovery.** Call `pi.getSettings()` at tool-call time and read `packages` (`PackageSource[]` = `string | { source: string; ... }`). Extract only the `source` field. Do not read the settings files directly and do not scan the filesystem. Reading at call time means the listing reflects live settings.
- **Source parsing.** Recognise the `npm:` prefix. Parse the npm spec into `{ name, spec }`, supporting `name`, `name@version`, `@scope/name`, and `@scope/name@version`. A source with a `git:` or `local`/path form is kept and reported as `unsupported`. A source that parses to an unsafe name (empty, containing a path separator or `..`) is rejected as `not_found`.
- **Path resolution (npm, V1).** For a package `name`:
  - user scope root: `<agentDir>/npm/node_modules/<name>`
  - project scope root: `<cwd>/.pi/npm/node_modules/<name>`

  where `agentDir = getAgentDir()` (reads `PI_CODING_AGENT_DIR`, else `~/.pi/agent`) and `.pi` is `CONFIG_DIR_NAME`, both imported from `@earendil-works/pi-coding-agent`. Resolve project first, then user, mirroring the harness's project-over-user precedence. Report every scope that exists, marking project active. This mirrors `DefaultPackageManager`'s npm rules; it does not re-implement source parsing beyond the npm form.
- **README lookup.** Within a resolved root, find `README.md` case-insensitively (case-folded directory listing, no recursive walk). Read it fresh. Confine the read: resolve the candidate path, require it to be the root or to start with `root + path.sep`, and require it to be a regular file (reject symlinks and non-files). Cap the returned content by bytes and append the absolute path plus a "read more at" pointer when truncated.
- **Result kinds:** `ok`, `no_docs` (installed, no README), `not_found` (not installed, or unsafe source), `unsupported` (non-npm source in V1), `ambiguous` (bare name matching more than one installed source). `ok` and `ambiguous`/`no_docs` carry structured `details`; use `isError: true` with data for failures so programmatic callers still receive `structuredContent`.
- **Tool shape.** One tool, `extension_docs`, exported constant `TOOL_NAME`. Parameters: a single optional `source` string. No argument returns the listing. Description names the no-argument listing as the discovery step and states npm-only V1.
- **Listing shape.** One line per package: source, scope(s), resolved path or README presence, and a marker for unsupported sources. Bounded by a byte cap. The listing itself is the bootstrap the agent needs; no system-prompt hint is added.
- **No auto-injection.** The extension never mutates the system prompt or injects READMEs on session start. Documentation is fetched on demand only.
- **No cache.** Every call reads the filesystem.
- **No lifecycle work.** The factory registers the tool synchronously and starts nothing; no `session_start`/`session_shutdown` handlers are needed.
- **Modes.** The tool uses no `ctx.ui`, so it works in interactive, RPC, JSON, and print modes unchanged.
- **No `@pidev/config` dependency.** V1 has no configuration file; scope roots come from the environment and the session, not from a config schema.

## Testing Decisions

- **Good test.** Exercise the tool the way Pi calls it: build a real temporary directory tree, point `getSettings` at matching sources, invoke the registered tool through the captured `ToolDefinition.execute`, and assert the returned text and `details`. Do not assert private helpers, call order, or field names that are not part of the result contract. Confinement and casing are asserted through the same boundary by placing candidate files in the temp tree.
- **One seam.** `createMockPi({ getSettings })` from `@pidev/test-utils`, plus real temp directories (mirroring `config/config.test.ts`, which uses a stubbed `HOME` and the real filesystem). No mocked `fs` module and no new seam.
- **Tool shape.** Assert with `assertToolContract` from `@pidev/test-utils`: name `extension_docs`, no required fields, optional `source` present.
- **Cases.**
  - no argument lists every npm package from `getSettings().packages` (string and object forms);
  - a scoped name resolves and returns README content;
  - lookup by exact source string and by bare name both resolve;
  - bare name matching both a user and a project install reports both and marks project active;
  - `no_docs` when the root exists without a README;
  - `not_found` when the root does not exist;
  - `unsupported` for a `git:` source;
  - `not_found` for a name containing `..` or a separator;
  - a README in lowercase resolves;
  - a symlinked README (or one pointing outside the root) is refused;
  - oversized README is byte-capped with the path pointer present;
  - a malformed `packages` value does not throw;
  - the tool works with `hasUI: false`.
- **Manifest.** `ship-manifest.test.ts` using `verifyShipManifest`.
- **Prior art.** `hello.register.test.ts` and `hello.hello.contract.test.ts` (capture the tool, call `execute`, assert result), `config/config.test.ts` (temp/`HOME` handling), `checks/ship-manifest.test.ts`.

## Out of Scope

- **git and local packages.** V1 resolves npm only. A `git:` or path source is reported `unsupported`, not resolved. Git installs live under `<scopeRoot>/git/<host>/<path>`, not `node_modules`, so resolving them is a separate change.
- **package documentation other than `README.md`.** No `file` argument, no `.md` walk, no following links inside a README.
- **pnpm and Bun global/legacy install roots.** V1 does not consult `npm root -g`, pnpm's global store, or Bun's global store. A follow-up spec must cover these.
- **Windows-specific path handling** and case-insensitive filesystems beyond the README casing rule.
- **Temporary and `-e` packages.** They are not in settings and are not resolved.
- **Any package-gallery or registry lookup.** No network calls.
- **Auto-injection into the system prompt** or any session-start context mutation.
- **Caching, invalidation, or a watcher.**
- **Executing package code, scripts, or manifests.** The tool reads one file and nothing else.
- **Exposing the package's manifest** (commands, skills, prompts, themes) beyond what is already visible through `pi.getAllTools()` / `pi.getCommands()`.

## Further Notes

- **npm-only is a deliberate V1 cut.** `DefaultPackageManager` also resolves pnpm/Bun global roots and legacy npm globals (`getNpmInstallPath` falls back to `getLegacyGlobalNpmInstallPath`). V1 mirrors only the managed `npm/node_modules` layout. A follow-up spec must define behaviour for pnpm, Bun, and Windows, and should prefer the harness's own resolver over a second implementation.
- **Why not reuse the harness resolver now.** `DefaultPackageManager.listConfiguredPackages()` and `getInstalledPath()` already return `{ source, scope, filtered, installedPath? }` — exactly the shape this tool wants — but they are not exposed through `ExtensionAPI`. `DefaultPackageManager`, `SettingsManager`, `getAgentDir`, and `CONFIG_DIR_NAME` are all exported from the package root (verified against the pinned `1.1.0` `dist/index.d.ts`), so V1 imports `getAgentDir`/`CONFIG_DIR_NAME` and mirrors the npm path rules. If the harness later exposes a package-listing method, this tool should switch to it in one place.
- **SDK caveat.** `getAgentDir()` reads `PI_CODING_AGENT_DIR` and otherwise defaults to `~/.pi/agent`. An SDK embedder that passes a custom agent directory straight to the loader (not via the environment) will diverge. This is the strongest argument for the harness API above.
- **Trust.** Pre-trust, project settings load empty, so project packages simply do not appear; no extra gating is added. This is the same behaviour Pi itself has.
- **Prompt injection.** Restricting V1 to `README.md` at the package root is the main mitigation. The strengthened version (arbitrary `.md` behind a config flag) remains a later decision, as noted in the original task.
- **Follow-up spec required for pnpm/Bun.** Do not silently extend this package to cover them; write the follow-up spec first and note the resolver-selection rule there.
- Repo conventions apply: lockstep versions, no decision-code citations in `.ts`, co-located tests, `files` manifest with a ship check, no code comments beyond one-line why, no emojis.
