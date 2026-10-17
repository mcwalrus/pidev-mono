---
name: adding-a-package
description: Scaffold a new `@pidev/*` package in the pidev-mono monorepo so it matches the lockstep-version, raw-TypeScript, peer-dependency and co-located-test conventions. Use when asked to add, create, or scaffold a new package or extension in this repo.
---

# Adding a package

Every package lives at `packages/<feature>` and publishes as `@pidev/<feature>`.
Packages publish raw `.ts` (`noEmit`), share one version, and are validated by
co-located tests plus a ship-manifest check. Follow these steps so a new package
plugs into the existing tooling without extra wiring.

1. Create `packages/<name>/` with a `package.json` at the lockstep version, a
   `pi.extensions: ["./index.ts"]` field, and the relevant `peerDependencies`.
2. Populate `files` with every shipped `.ts` and asset directory.
3. Add a `ship-manifest.test.ts` and co-located `*.test.ts` files.
4. Add `"test": "vitest run"` to the package scripts.
5. Run `node scripts/sync-versions.js` to wire intra-monorepo deps.
6. Add a `CHANGELOG.md` containing `## [Unreleased]`.
7. If the package owns module-level singleton state, export a reset function and
   wire it into `test/setup.ts` `beforeEach`.

Host-provided packages (`@earendil-works/pi-*`, `typebox`) are always
`peerDependencies`, never `dependencies`. Copy `packages/hello` as the worked
example of tool registration, the tool-result envelope, and details-based replay.
