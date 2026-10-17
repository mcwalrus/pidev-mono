---
name: conventions
description: The code and packaging conventions for the pidev-mono monorepo (lockstep versions, host-provided peer dependencies, raw-TypeScript publishing, co-located tests, comment style). Use before writing or editing packages in this repo so changes match existing structure.
---

# Conventions

These hold across every package in this repo. `just check` and the git hooks
enforce most of them.

- **Lockstep versions** — every `packages/*/package.json` shares one version,
  enforced by `sync-versions.js`.
- **Host-provided packages** (`@earendil-works/pi-*`, `typebox`) are always
  `peerDependencies`, never `dependencies`; Pi aliases them at load time.
- **`pi` manifest field** — `pi.extensions: ["./index.ts"]` names the module that
  default-exports the extension factory.
- **`files` arrays** list every shipped `.ts` plus asset directories; a
  `ship-manifest.test.ts` proves the tarball is complete.
- **Co-located tests** — `*.test.ts` beside sources.
- **`type: "module"`** everywhere, Node16 resolution, relative imports use `.js`.
- **No decision-code citations** in committed `.ts` — comments state the contract,
  not a ticket or decision number (`check:decision-codes`).
- **Keep files small** — the file-size ratchet (`check:file-sizes`) fails if a
  file grows past its baseline; split rather than bump the baseline casually.
