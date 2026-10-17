# @pidev/config

Shared JSON config I/O utilities for pidev-mono sibling packages.

**Not a Pi extension** — no `pi` field, no tool/command/hook registration. Opt-in
library: siblings add it to their `dependencies` explicitly.

## Why it exists

Every extension needs the same handful of things: a config path that honours
`XDG_CONFIG_HOME`, a crash-resistant JSON reader, a best-effort writer, env-var
lookup, and TypeBox-driven validation. This package is the single canonical copy
so the logic does not diverge across siblings.

## Public API

| Export | Purpose |
|---|---|
| `configPath(name, file?)` | `<resolveConfigDir()>/<name>/<file>` — XDG-aware, `~/.config` fallback |
| `loadJsonConfig<T>(path)` | Read + parse JSON; `{}` for missing / malformed / non-object |
| `loadJsonConfigWithLegacyFallback<T>(name, file?)` | Prefer XDG path, fall back to legacy only when the XDG file is absent |
| `saveJsonConfig(path, data)` | Write formatted JSON, mkdir + chmod `0600`; returns `boolean` |
| `GuidanceFields` / `GuidanceFieldsSchema` | The shared `{ promptSnippet?, promptGuidelines?, description? }` shape |
| `validateGuidanceFields(fields)` | Extract valid guidance fields from an unknown value |
| `parseModelKey` / `modelKey` | `provider/modelId` codec (slash-canonical, colon-tolerant read) |
| `readEnvVar(key, fallback?)` | Trimmed env-var lookup |
| `validateConfig<T>(schema, value)` | TypeBox clean + defaults; `{}` on failure |

## Rules

- **Stateless** — no module-level singletons, no `globalThis` caches, no import-time
  side effects. It needs no reset wiring in `test/setup.ts`.
- **`saveJsonConfig` returns a boolean** — callers MUST guard their "Saved …"
  notification on it, so a disk-full / EACCES write cannot make the message lie.
- `typebox` is a **host-provided** package: declared as `peerDependencies: "*"`,
  never `dependencies`. Pi aliases the bare specifier at extension load time.
