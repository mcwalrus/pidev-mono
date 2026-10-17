# pidev-mono

Monorepo for Pi CLI extensions in the `@pidev/*` family. Lockstep versions, a
single install, a single publish pipeline.

# Architecture

```
pidev-mono/
├── packages/
│   ├── config/       — @pidev/config: shared config I/O (NOT a Pi extension)
│   ├── hello/        — @pidev/hello: example extension (tool + command + replay)
│   └── test-utils/   — @pidev/test-utils: private shared fixtures (not published)
├── test/setup.ts     — repo-wide Vitest setup (HOME stub + env hygiene + resets)
├── scripts/          — release pipeline + fail-fast repo guards
├── vitest.config.ts  — single runner; include: ['packages/*/**/*.test.ts']
├── tsconfig.base.json— single shared TS config; no per-package tsconfig.json
├── package.json      — npm workspaces root
└── biome.json        — single shared lint/format config
```

**Build model**: `noEmit: true` everywhere. Packages publish raw `.ts` (Pi loads
`.ts` via the `pi` manifest). No `dist/`.

**Plugin discovery**: an extension package's `package.json` carries
`pi.extensions: ["./index.ts"]`. Pi loads the default-exported function with an
`ExtensionAPI`. Libraries (config) and test-utils have no `pi` field.

**Lockstep**: every `packages/*/package.json` shares one `version`, enforced by
`scripts/sync-versions.js` (exit 1 on drift).

# Commands

| Command | Description |
|---|---|
| `npm install` | One install at root; workspace symlinks under `node_modules/` |
| `npm run check` | host-provided-dep guard → Biome (`--write`) → `tsc --noEmit` |
| `npm run check:host-provided-deps` | No host-provided pkg in an install-time dep; no unaliased `typebox` import |
| `npm run check:file-sizes` | Size-growth ratchet (baselined + new-file caps) |
| `npm run check:decision-codes` | No parenthesized plan/phase citations in committed `.ts` |
| `npm test` | Vitest at root |
| `npm run coverage` | Vitest with V8 coverage |
| `node scripts/sync-versions.js` | Verify lockstep + rewrite intra-monorepo deps |
| `node scripts/release.mjs <patch\|minor\|major\|x.y.z>` | Cut a lockstep release |

Husky (local-only): `pre-commit` runs the guards + `npm run check`; `pre-push`
runs `npm run coverage`.

# Conventions

- **Lockstep versions**; directory `packages/<feature>` ↔ npm `@pidev/<feature>`.
- **Host-provided packages** (`@earendil-works/pi-*`, `typebox`) are always
  `peerDependencies: "*"`, never `dependencies`; import only aliased specifiers.
- **`files` arrays** list every shipped `.ts` + asset dir; a
  `ship-manifest.test.ts` proves the tarball is complete.
- **Co-located tests** (`*.test.ts`) discovered by the root include glob.
- **`type: "module"`**, Node16 resolution, relative imports use `.js`.
- **Tool envelope**: `{ content: [{ type: "text", text }], details }`; `details`
  is the replay snapshot rebuilt on `session_start` / compaction / reload.
- **Singleton reset**: packages with module state export a reset, wired into
  `test/setup.ts` `beforeEach`.

<important if="you are adding a new sibling Pi extension package">
1. Create `packages/<name>/` with `package.json` at the lockstep version,
   `pi.extensions: ["./index.ts"]`, and the relevant `peerDependencies`.
2. Populate `files` with every shipped `.ts` + asset directory.
3. Add co-located `*.test.ts` + a `ship-manifest.test.ts`.
4. Add `"test": "vitest run"` to the package scripts.
5. Run `node scripts/sync-versions.js` to wire intra-monorepo deps.
6. Add `CHANGELOG.md` containing `## [Unreleased]`.
7. Export a reset for module-level state and wire it into `test/setup.ts`.
</important>

See [`PATTERNS.md`](../../PATTERNS.md) for the full pattern catalogue and rationale.
