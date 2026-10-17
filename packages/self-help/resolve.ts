import { existsSync, statSync } from "node:fs";
import { join, resolve as resolvePath, sep } from "node:path";

export type PackageScope = "user" | "project";

export interface ResolvedPackage {
	/** Original settings source string, e.g. `npm:@scope/name@1.2.3`. */
	source: string;
	/** Parsed npm package name, without the `npm:` prefix or version range. */
	name: string;
	scope: PackageScope;
	/** Absolute path to the package's `package.json`. */
	location: string;
	description?: string;
	/** Absolute path to the package's `README.md`, when one is present. */
	readme?: string;
}

export interface ResolveContext {
	agentDir: string;
	cwd: string;
	configDirName: string;
}

const UNSCOPED_NAME = /^[^/\\@]+$/;
const SCOPED_NAME = /^@[^/\\]+\/[^/\\]+$/;

/** Pull the `source` strings out of an arbitrary `packages` settings value, ignoring malformed entries. */
export function extractSources(packages: unknown): string[] {
	if (!Array.isArray(packages)) return [];
	const out: string[] = [];
	for (const entry of packages) {
		if (typeof entry === "string") {
			out.push(entry);
		} else if (entry !== null && typeof entry === "object") {
			const source = (entry as { source?: unknown }).source;
			if (typeof source === "string") out.push(source);
		}
	}
	return out;
}

/**
 * Parse an `npm:` source into a name and spec. Returns undefined for a non-npm
 * source, an empty spec, a malformed name, or a name that could escape an install
 * root (a path separator, `..`, or a leading separator).
 */
export function parseNpmSource(source: string): { name: string; spec: string } | undefined {
	if (!source.startsWith("npm:")) return undefined;
	const spec = source.slice(4).trim();
	if (spec === "" || spec.includes("..")) return undefined;

	let name = spec;
	if (name.startsWith("@")) {
		const slash = name.indexOf("/");
		if (slash < 0) return undefined;
		const versionAt = name.indexOf("@", slash);
		if (versionAt >= 0) name = name.slice(0, versionAt);
		if (!SCOPED_NAME.test(name)) return undefined;
	} else {
		const versionAt = name.indexOf("@");
		if (versionAt >= 0) name = name.slice(0, versionAt);
		if (!UNSCOPED_NAME.test(name)) return undefined;
	}
	return { name, spec };
}

/** A name is safe only when joining it under an install root cannot leave that root. */
export function isSafeName(name: string): boolean {
	if (name === "" || name.includes("..")) return false;
	if (!SCOPED_NAME.test(name) && !UNSCOPED_NAME.test(name)) return false;
	return true;
}

function managedRoot(context: ResolveContext, scope: PackageScope, name: string): string {
	const base =
		scope === "project"
			? join(context.cwd, context.configDirName, "npm", "node_modules")
			: join(context.agentDir, "npm", "node_modules");
	const root = join(base, name);
	// Defence in depth: the parsed name already excludes traversal, but never
	// hand a path outside the install root to the caller.
	const contained = resolvePath(root);
	return contained === resolvePath(base) || contained.startsWith(`${resolvePath(base)}${sep}`) ? contained : "";
}

function installedAt(context: ResolveContext, scope: PackageScope, name: string): string | undefined {
	const root = managedRoot(context, scope, name);
	if (root === "" || !existsSync(root)) return undefined;
	try {
		return statSync(root).isDirectory() ? root : undefined;
	} catch {
		return undefined;
	}
}

export function resolvePackages(packages: unknown, context: ResolveContext): ResolvedPackage[] {
	const out: ResolvedPackage[] = [];
	for (const source of extractSources(packages)) {
		const parsed = parseNpmSource(source);
		if (!parsed) continue;
		const root = installedAt(context, "user", parsed.name);
		if (!root) continue;
		out.push({
			source,
			name: parsed.name,
			scope: "user",
			location: join(root, "package.json"),
		});
	}
	return out;
}
