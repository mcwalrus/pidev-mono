# piex-mono

Monorepo for Pi extensions in the `@piex/*` family. Lockstep versions, one
install, one publish pipeline. Targets the Pi Agent CLI
(`@earendil-works/pi-coding-agent`).

The framework and its conventions are extracted from `rpiv-mono`; see
[`PATTERNS.md`](./PATTERNS.md) for the pattern catalogue and why each piece exists.

## Layout

```
piex-mono/
├── packages/
│   ├── config/        — @piex/config: shared config I/O library (not an extension)
│   ├── hello/         — @piex/hello: example extension (tool + command + replay)
│   └── test-utils/    — @piex/test-utils: private shared test fixtures (not published)
├── test/setup.ts      — repo-wide Vitest setup (HOME stub, env hygiene, singleton resets)
├── scripts/           — release pipeline + repo guards (host-provided deps, file sizes)
├── vitest.config.ts   — single Vitest runner over `packages/*/**/*.test.ts`
├── tsconfig.base.json — single shared TS config (noEmit; packages publish raw .ts)
└── biome.json         — single shared lint/format config
```

**Build model**: `noEmit: true` everywhere. Packages publish raw `.ts`; Pi loads
`.ts` directly via the `pi` manifest field. No `dist/`, no per-package tsconfig.

## Commands

| Command | Description |
|---|---|
| `npm install` | One install at root; workspace symlinks under `node_modules/` |
| `npm run check` | Host-provided-dep guard → Biome (`--write --error-on-warnings`) → `tsc --noEmit` |
| `npm run check:host-provided-deps` | No host-provided package in an install-time dep field; no unaliased `typebox` import |
| `npm test` | Vitest at root across every package |
| `npm run coverage` | Vitest with V8 coverage |
| `node scripts/sync-versions.js` | Verify lockstep + rewrite intra-monorepo deps to `^<version>` |
| `node scripts/release.mjs <patch\|minor\|major\|x.y.z>` | Cut a lockstep release |

Husky hooks (local-only): `pre-commit` runs the guards + `npm run check` and
restages formatter rewrites; `pre-push` runs the full coverage gate.

## Conventions

- **Lockstep versions** — every `packages/*/package.json` shares one version,
  enforced by `sync-versions.js`. Directory `packages/<feature>` ↔ npm `@piex/<feature>`.
- **Sibling deps as `peerDependencies: "*"`**; host-provided packages
  (`@earendil-works/pi-*`, `typebox`) are **never** `dependencies`.
- **`pi` manifest field** — `pi.extensions: ["./index.ts"]` tells Pi which module
  default-exports the extension factory.
- **`files` arrays** explicitly list every shipped `.ts` plus asset directories;
  a `ship-manifest.test.ts` proves the tarball is complete.
- **Co-located tests** — `*.test.ts` next to sources; the root include glob finds them.
- **`type: "module"`** everywhere, Node16 resolution, relative imports use `.js`.
- **No decision-code citations** in committed `.ts` — comments state the contract.

## Adding a sibling package

1. Create `packages/<name>/` with `package.json` at the lockstep version,
   `pi.extensions: ["./index.ts"]`, and the relevant `peerDependencies`.
2. Populate `files` with every shipped `.ts` + asset directory.
3. Add a `ship-manifest.test.ts` and co-located `*.test.ts` files.
4. Add `"test": "vitest run"` to the package scripts.
5. Run `node scripts/sync-versions.js` to wire intra-monorepo deps.
6. Add a `CHANGELOG.md` containing `## [Unreleased]`.
7. If the package owns module-level singleton state, export a reset function and
   wire it into `test/setup.ts` `beforeEach`.
