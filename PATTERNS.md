# Patterns extracted from rpiv-mono

A catalogue of the reusable patterns this scaffold is built on, and where each
one lives here. Each entry states the pattern, why it exists, and the cheapest
place to copy it from.

## 1. npm-workspaces monorepo with lockstep versions

**Pattern.** One root `package.json` with `workspaces: ["packages/*"]`, one
install at the root, and every package sharing a single `version`. `scripts/sync-versions.js`
fails the build if any two packages drift, then rewrites intra-monorepo deps to
`^<version>` (idempotent: it only writes a manifest when something changes).

**Why.** A family of extensions that must ship together has exactly one version
number, not N. Drift is the failure mode; the script makes it impossible.

**Where.** `scripts/sync-versions.js`, root `package.json` (`version:*`, `release:*`).

## 2. Publish raw `.ts` — no build step

**Pattern.** `tsc` runs with `noEmit: true`; there is no `dist/`. Pi loads `.ts`
directly through the `pi` manifest field. One shared `tsconfig.base.json` at the
root; no per-package tsconfig.

**Why.** The host's extension loader transpiles TypeScript itself. A build step
adds a stale-artifact failure mode with no benefit.

**Where.** `tsconfig.base.json`, each `package.json` `pi.extensions`.

## 3. Host-provided packages are peers, never dependencies

**Pattern.** `@earendil-works/pi-ai`, `pi-agent-core`, `pi-coding-agent`,
`pi-tui`, and `typebox` are declared as `peerDependencies: "*"` and imported only
through specifiers the host aliases (`typebox`, `typebox/compile`, `typebox/value`).
`scripts/check-host-provided-deps.mjs` scans every manifest and source file and
fails on any violation.

**Why.** Pi aliases the bare specifier to its bundled copy at load time. An
installed copy puts two live instances of the same module in one process —
schemas built by one, validated by the other. The guard catches the shape before
publish; the host only warns at startup.

**Where.** `scripts/check-host-provided-deps.mjs`, all `package.json` peer fields,
wired as the first stage of `npm run check`.

## 4. The `pi` manifest field

**Pattern.** An extension package carries `"pi": { "extensions": ["./index.ts"] }`
and its `index.ts` default-exports a `function (pi: ExtensionAPI)`. Libraries
(`config`) and test-utils simply omit the `pi` field.

**Why.** It is the discovery contract — the loader reads the manifest, not a
filesystem convention.

**Where.** `packages/hello/package.json`, `packages/hello/index.ts`.

## 5. Tool result envelope + details-based replay

**Pattern.** Every tool returns
`{ content: [{ type: "text", text }], details: <typed snapshot> }`. `details` is
the persisted replay snapshot. On `session_start` (and compaction/reload), the
extension walks the session branch root→leaf and rebuilds module state from the
last snapshot. Calls that never land as a standalone `toolResult` also
`pi.appendEntry(customType, details)` so they survive too.

**Why.** Extensions are in-memory; the session branch is the durable store.
Without replay, state vanishes on `/reload` and compaction.

**Where.** `packages/hello/hello.ts` (`execute`, `appendEntry`),
`packages/hello/state/store.ts` (`replayFromBranch`), `packages/hello/index.ts`
(`session_start` handler).

## 6. TypeBox tool schemas with LLM-facing copy

**Pattern.** Parameters are a standalone-`typebox` `Type.Object({...})`. The
`description` on the tool and on each property is written for the model. Optional
`promptSnippet` / `promptGuidelines` come from config with sane defaults.

**Why.** Schema is validated by the host *and* read as prompt text; the same
string serves both. Keeping it in one place prevents schema/prompt drift.

**Where.** `packages/hello/hello.ts`, `packages/config/config.ts`
(`GuidanceFields`, `validateGuidanceFields`).

## 7. Shared config I/O library

**Pattern.** A stateless, non-extension library (`@piex/config`) owns XDG-aware
path resolution, crash-resistant JSON load, best-effort save, env lookup, and
TypeBox validation. Siblings depend on it explicitly.

**Why.** Every extension needs the same five functions. Centralizing them kills
the copy-paste divergence — the source repo had four byte-identical copies of the
guidance-field validator.

**Where.** `packages/config/`, consumed by `packages/hello/config.ts`.

## 8. One test runner, shared setup, co-located tests

**Pattern.** A single root `vitest.config.ts` with
`include: ["packages/*/**/*.test.ts"]` and one `test/setup.ts`. Tests live next to
their sources. No per-package vitest config.

**Why.** One discovery glob covers new packages automatically; one setup file
guarantees every package gets the same HOME stub, env hygiene, and singleton
resets.

**Where.** `vitest.config.ts`, `test/setup.ts`.

## 9. HOME-stub-before-import, plus per-test singleton resets

**Pattern.** `test/setup.ts` points `HOME`/`USERPROFILE` at a fresh tmpdir
*before any package import*, then dynamic-imports each package inside
`beforeEach` to reset module-level singleton state and clear env vars. Static
imports are deliberately avoided — ESM hoists them above the HOME assignment.

**Why.** Production code caches `homedir()` at module load. Hoisting the imports
silently makes tests read and write the developer's real `~/.config`.

**Where.** `test/setup.ts`; new stateful packages must add their reset here.

## 10. Shared test fixtures as a private workspace package

**Pattern.** `@piex/test-utils` (`"private": true`) provides `createMockPi()`,
`createMockCtx()`, `assertToolContract()`, `verifyShipManifest()`, and message
builders. Excluded from coverage and publish.

**Why.** One canonical mock replaces copy-pasted fixtures; tests across packages
share an identical host surface.

**Where.** `packages/test-utils/`.

## 11. Ship-manifest verification

**Pattern.** Each published package has a one-line `ship-manifest.test.ts` that
compares its `package.json` `files` array against the on-disk production `.ts`
tree — flagging modules the tarball would omit.

**Why.** Non-trivial extension packages inevitably forget a new module in the
`files` array; the failure only surfaces after publish, for users.

**Where.** `packages/*/ship-manifest.test.ts`, `packages/test-utils/manifest.ts`.

## 12. Fail-fast repo guards

**Pattern.** Small, dependency-free scripts that walk the tree and exit 1 with a
`path:line` report:

- `check-host-provided-deps.mjs` — peer-pin invariant + aliased imports (pattern 3)
- `check-file-sizes.mjs` — a size ratchet: baselined files may grow
  `max(+10%, +50 lines)`; new files fit a class cap (1000 source / 3000 test).
  Regeneration is a visible baseline diff in the same commit as the growth.
- `check-no-decision-codes.mjs` — keeps transient plan/phase codes out of
  committed `.ts`; comments must state the contract in place.

**Why.** A fixed threshold gets raised the day it trips. A committed ratchet
makes every raise reviewable. Comments that cite a deleted design doc are
unreadable; the guard keeps rationale local.

**Where.** `scripts/`, wired into `npm run check`, Husky `pre-commit`, and CI.

## 13. Lockstep release pipeline

**Pattern.** `scripts/release.mjs` orchestrates: preflight (clean tree + npm
auth) → bump all workspaces → promote each `CHANGELOG.md` `[Unreleased]` to a
dated version heading → commit + tag → `npm publish -ws` → reinstate
`[Unreleased]` → push. Publishing is local-only; CI tests but never publishes.

**Why.** A release is one atomic, reproducible monorepo-wide action. Manual
per-package publishing drifts versions and orderings.

**Where.** `scripts/release.mjs`, `scripts/sync-versions.js`,
`packages/*/CHANGELOG.md`.

## 14. Root devDependencies pinned exact (fresh-resolution hazard)

**Pattern.** Both release paths delete `node_modules` + `package-lock.json` and
reinstall. So the root devDependencies (biome, tsc, vitest, pi-*, typebox,
husky, shx) are pinned **exact**, bumped deliberately in normal commits.

**Why.** On release day a caret spec re-resolves to whatever npm serves; a
minor lint or type-surface change then breaks a release that was green last week.

**Where.** root `package.json` `devDependencies` + `overrides`.

## 15. Local-first quality gates

**Pattern.** Husky `pre-commit` runs the fail-fast guards then `npm run check`
and restages formatter rewrites (handling partially-staged files);
`pre-push` runs the full coverage gate. CI runs the same guards plus coverage on
a Node version matrix.

**Why.** Cheap guards fail fast before the expensive pass, locally and in CI,
with one shared command handle (`npm run check:*`) so hooks and CI never diverge.

**Where.** `.husky/`, `.github/workflows/ci.yml`.

## 16. Architecture guidance as a tracked artifact

**Pattern.** Hand-curated `.rpiv/guidance/**/architecture.md` files record each
layer's responsibility, dependencies, public API, and boundaries. They are
tracked (unlike `.rpiv/artifacts/`, which is run state).

**Why.** The codebase's *intent* lives next to it, versioned, instead of in a
stale wiki. New contributors and agents read the contract before the code.

**Where.** `.rpiv/guidance/architecture.md` (this repo's short version);
`PATTERNS.md` is the catalogue.

## Deliberately not extracted

- **A separate i18n package.** Useful, but optional and heavyweight; the pattern
  is an optional peer (`peerDependenciesMeta.optional`) plus a dynamic
  `import()` guarded by try/catch so the extension stays online English-only.
  Add it when a second locale is real.
- **Per-session store partitioning.** The example keeps one module-level store.
  Partition by `sessionManager.getSessionId()` when children/relays matter.
- **A marketing site package.** No relation to the extension framework.
