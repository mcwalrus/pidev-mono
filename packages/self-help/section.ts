import type { ResolvedPackage } from "./resolve.js";

export const DEFAULT_SECTION_BYTE_CAP = 8192;

const USAGE = [
	"The following extensions are installed.",
	"Read an extension's README with the read tool when the user asks about it.",
];

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function renderFull(packages: readonly ResolvedPackage[]): string {
	const lines = ["", "", ...USAGE, "", "<available_extensions>"];
	for (const pkg of packages) {
		lines.push("  <extension>");
		lines.push(`    <name>${escapeXml(pkg.name)}</name>`);
		lines.push(`    <location>${escapeXml(pkg.location)}</location>`);
		lines.push("  </extension>");
	}
	lines.push("</available_extensions>");
	return lines.join("\n");
}

function renderCompact(packages: readonly ResolvedPackage[]): string {
	const lines = ["", "", ...USAGE, "", "<available_extensions>"];
	for (const pkg of packages) {
		lines.push(
			`  <extension><name>${escapeXml(pkg.name)}</name><location>${escapeXml(pkg.location)}</location></extension>`,
		);
	}
	lines.push("</available_extensions>");
	lines.push("Truncated to fit the prompt budget. Run /self-help for the full audit.");
	return lines.join("\n");
}

/**
 * Format the `extensions` prompt section, or undefined when nothing is installed.
 * Over the byte cap the block degrades to names and locations plus a truncation
 * note rather than dropping packages silently.
 */
export function formatExtensionsSection(
	packages: readonly ResolvedPackage[],
	byteCap: number = DEFAULT_SECTION_BYTE_CAP,
): string | undefined {
	if (packages.length === 0) return undefined;
	const full = renderFull(packages);
	if (Buffer.byteLength(full, "utf8") <= byteCap) return full;
	return renderCompact(packages);
}
