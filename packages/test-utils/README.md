# @pidev/test-utils

Internal, **private** test-fixture package for pidev-mono. Never published.

## What it provides

- **`pi.ts`** — `createMockPi()` captures every `registerTool` / `registerCommand` /
  `registerShortcut` / `on` call; `createMockUI()`, `createMockSessionManager()`,
  `createMockModelRegistry()`, `createMockCtx()` complete the host surface.
- **`contract.ts`** — `assertToolContract()` proves a tool's name, description,
  `execute`, and TypeBox `required`/optional fields; `describeRegisteredTools()`
  drives an extension factory against a mock pi and returns its tools;
  `roundTripBranchState()` exercises details-replay symmetry.
- **`manifest.ts`** — `verifyShipManifest()` compares a package's `files` array to
  its on-disk production `.ts` tree, catching modules the npm tarball would omit.
- **`theme.ts` / `session.ts` / `fs.ts`** — theme/entry/message builders and
  `writeGuidanceTree()`.

## Why a workspace package

One canonical implementation replaces copy-pasted fixtures across packages. It is
excluded from coverage and from the publish set (`"private": true`).

## Using it

```ts
import { createMockPi, assertToolContract } from "@pidev/test-utils";
```
