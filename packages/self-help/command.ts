import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { parseNpmSource, type ResolvedPackage } from "./resolve.js";

export const COMMAND_NAME = "self-help";
export const DEFAULT_COMMAND_BYTE_CAP = 8192;

function documentationState(pkg: ResolvedPackage): string {
	return pkg.readme ? `README ${pkg.readme}` : "undocumented (no README.md at the package root)";
}

function bounded(text: string, byteCap: number): string {
	if (Buffer.byteLength(text, "utf8") <= byteCap) return text;
	const notice = "(output truncated; run /self-help with a package name for detail)";
	const out: string[] = [];
	let bytes = 0;
	const noticeBytes = Buffer.byteLength(notice, "utf8") + 1;
	for (const line of text.split("\n")) {
		const size = Buffer.byteLength(line, "utf8") + 1;
		if (bytes + size + noticeBytes > byteCap) break;
		out.push(line);
		bytes += size;
	}
	out.push(notice);
	return out.join("\n");
}

function installLines(pkg: ResolvedPackage): string[] {
	return [`  ${pkg.scope}: ${pkg.location}`, `    ${documentationState(pkg)}`];
}

/** One grouped line per package: source, every scope, each installed path, and its documentation state. */
export function formatAudit(packages: readonly ResolvedPackage[], byteCap = DEFAULT_COMMAND_BYTE_CAP): string {
	if (packages.length === 0) return "No installed extension packages.";
	const groups = new Map<string, ResolvedPackage[]>();
	for (const pkg of packages) {
		const installs = groups.get(pkg.source);
		if (installs) installs.push(pkg);
		else groups.set(pkg.source, [pkg]);
	}
	const lines: string[] = [];
	for (const [source, installs] of groups) {
		lines.push(source);
		for (const install of installs) lines.push(...installLines(install));
	}
	return bounded(lines.join("\n"), byteCap);
}

export function matchPackages(packages: readonly ResolvedPackage[], query: string): ResolvedPackage[] {
	const parsed = parseNpmSource(query.startsWith("npm:") ? query : `npm:${query}`);
	return packages.filter((pkg) => pkg.source === query || (parsed !== undefined && pkg.name === parsed.name));
}

/** Report one package's locations, or say nothing matched. */
export function formatQuery(
	packages: readonly ResolvedPackage[],
	query: string,
	byteCap = DEFAULT_COMMAND_BYTE_CAP,
): string {
	const matches = matchPackages(packages, query);
	if (matches.length === 0) return `No installed extension matches "${query}".`;
	const lines: string[] = [];
	for (const pkg of matches) {
		lines.push(`${pkg.source} [${pkg.scope}]`);
		lines.push(...installLines(pkg));
	}
	return bounded(lines.join("\n"), byteCap);
}

export function registerSelfHelpCommand(
	pi: ExtensionAPI,
	resolve: (ctx: ExtensionCommandContext) => ResolvedPackage[],
): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "List installed extension packages and the location of their documentation",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			let resolved: ResolvedPackage[];
			try {
				resolved = resolve(ctx);
			} catch {
				resolved = [];
			}
			const query = args.trim();
			ctx.ui.notify(query === "" ? formatAudit(resolved) : formatQuery(resolved, query), "info");
		},
	});
}
