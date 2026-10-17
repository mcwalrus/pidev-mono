import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadJsonConfig, loadJsonConfigWithLegacyFallback } from "@pidev/config";
import { Type } from "typebox";
import { Value } from "typebox/value";

/** Directory name under the XDG config root (`~/.config/pidev-checks/config.json`). */
export const CONFIG_NAME = "pidev-checks";

/** Project-relative config file, checked before the user-global config. */
export const PROJECT_CONFIG_FILE = join(".pi", "checks", "config.json");

/** Applied when a check declares no `timeoutMs`. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export interface CheckDefinition {
	/** Unique, shown in the widget and command. */
	name: string;
	/** Executable, run without a shell. */
	command: string;
	args?: string[];
	/** Defaults to the session working directory. */
	cwd?: string;
	/** Defaults to {@link DEFAULT_TIMEOUT_MS}. */
	timeoutMs?: number;
}

const CheckEntrySchema = Type.Object({
	name: Type.String({ minLength: 1 }),
	command: Type.String({ minLength: 1 }),
	args: Type.Optional(Type.Array(Type.String())),
	cwd: Type.Optional(Type.String({ minLength: 1 })),
	timeoutMs: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
});

/**
 * Extract valid check definitions from a parsed config object. A missing or
 * non-array `checks` key warns and yields no checks; an invalid entry warns and
 * is skipped, leaving the rest intact.
 */
export function parseChecksConfig(raw: unknown): CheckDefinition[] {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
	const { checks } = raw as { checks?: unknown };
	if (checks === undefined) return [];
	if (!Array.isArray(checks)) {
		console.warn("pidev-checks: `checks` must be an array, ignoring config");
		return [];
	}
	const definitions: CheckDefinition[] = [];
	const seen = new Set<string>();
	const warned = new Set<string>();
	checks.forEach((entry, index) => {
		if (!Value.Check(CheckEntrySchema, entry)) {
			const first = [...Value.Errors(CheckEntrySchema, entry)][0];
			const where = first ? ` (${first.instancePath || "/"} ${first.message})` : "";
			console.warn(`pidev-checks: skipping invalid check at index ${index}${where}`);
			return;
		}
		const definition = Value.Clean(CheckEntrySchema, Value.Clone(entry)) as CheckDefinition;
		if (seen.has(definition.name) && !warned.has(definition.name)) {
			console.warn(`pidev-checks: duplicate check name "${definition.name}"`);
			warned.add(definition.name);
		}
		seen.add(definition.name);
		definitions.push(definition);
	});
	return definitions;
}

/**
 * Load checks for a session. When `cwd` is given, a project-local
 * `.pi/checks/config.json` under it is checked first and, if present, wins
 * outright; otherwise the user-global XDG config is used with legacy fallback.
 * A malformed file warns via the shared loader and yields no checks; never
 * throws.
 */
export function loadChecksConfig(cwd?: string): CheckDefinition[] {
	if (cwd) {
		const projectPath = join(cwd, PROJECT_CONFIG_FILE);
		if (existsSync(projectPath)) return parseChecksConfig(loadJsonConfig<unknown>(projectPath));
	}
	return parseChecksConfig(loadJsonConfigWithLegacyFallback<unknown>(CONFIG_NAME));
}
