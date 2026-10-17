import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
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
	/** True for the copy Pi loads when the same package exists in more than one scope. */
	active?: boolean;
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

function resolveInstall(source: string, name: string, scope: PackageScope, root: string): ResolvedPackage {
	return {
		source,
		scope,
		location: join(root, "package.json"),
		...readManifest(root, name),
		...readReadme(root),
	};
}

export function resolvePackages(packages: unknown, context: ResolveContext): ResolvedPackage[] {
	const out: ResolvedPackage[] = [];
	for (const source of extractSources(packages)) {
		const parsed = parseNpmSource(source);
		if (!parsed) continue;
		const projectRoot = installedAt(context, "project", parsed.name);
		const userRoot = installedAt(context, "user", parsed.name);
		const project = projectRoot ? resolveInstall(source, parsed.name, "project", projectRoot) : undefined;
		const user = userRoot ? resolveInstall(source, parsed.name, "user", userRoot) : undefined;
		if (project && user) project.active = true;
		if (project) out.push(project);
		if (user) out.push(user);
	}
	return out;
}

function readManifest(root: string, fallbackName: string): Pick<ResolvedPackage, "name" | "description"> {
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { name: fallbackName };
		const manifest = parsed as { name?: unknown; description?: unknown };
		const name = typeof manifest.name === "string" && manifest.name !== "" ? manifest.name : fallbackName;
		if (typeof manifest.description === "string") return { name, description: manifest.description };
		return { name };
	} catch {
		return { name: fallbackName };
	}
}

/** Confirm a README at the package root: case-insensitive name match, regular file only. */
function readReadme(root: string): Pick<ResolvedPackage, "readme"> {
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		return {};
	}
	const match = entries.find((entry) => entry.toLowerCase() === "readme.md");
	if (match === undefined) return {};
	const path = join(root, match);
	try {
		return lstatSync(path).isFile() ? { readme: path } : {};
	} catch {
		return {};
	}
}
