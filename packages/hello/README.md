# @pidev/hello

Example Pi extension for pidev-mono. It demonstrates the patterns a new sibling
should copy:

- **Tool registration** with a TypeBox parameter schema and LLM-facing
  `description` / `promptSnippet` / `promptGuidelines`.
- **Tool result envelope**: `{ content: [{ type: "text", text }], details }`,
  where `details` is the persisted replay snapshot.
- **Details-based replay** on `session_start` so state survives `/reload` and
  compaction. Both persistence shapes are handled: standalone `toolResult`
  messages and `custom` entries written by `pi.appendEntry`.
- **A slash command** (`/notes`) reading the same module state.
- **Shared config I/O** via `@pidev/config`.

## Config

Config lives at `~/.config/pidev-hello/config.json` (honours `XDG_CONFIG_HOME`):

```json
{
	"guidance": {
		"promptSnippet": "Keep short working notes",
		"promptGuidelines": ["Use `note` to record decisions worth keeping."]
	}
}
```

## Testing

Co-located `*.test.ts` files use `@pidev/test-utils`:

- `hello.contract.test.ts` — tool shape via `assertToolContract`
- `hello.register.test.ts` — registration, execute, and replay behavior
- `ship-manifest.test.ts` — the npm tarball covers every production `.ts`
