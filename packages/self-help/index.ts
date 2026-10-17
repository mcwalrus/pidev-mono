/**
 * @pidev/self-help — advertises installed extension packages to the agent.
 *
 * On `session_start` the extension resolves the npm packages declared in the
 * effective settings and holds the resolved list in extension-local memory. On
 * every `before_agent_start` it contributes one byte-bounded `extensions`
 * section naming each package and the location of its `package.json`. The agent
 * reads the advertised README with the ordinary `read` tool. Only locations are
 * injected — never README content.
 */

import { CONFIG_DIR_NAME, type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { registerSelfHelpCommand } from "./command.js";
import { type ResolvedPackage, resolvePackages } from "./resolve.js";
import { formatExtensionsSection } from "./section.js";

export {
	COMMAND_NAME,
	DEFAULT_COMMAND_BYTE_CAP,
	formatAudit,
	formatQuery,
	matchPackages,
	registerSelfHelpCommand,
} from "./command.js";
export type { PackageScope, ResolveContext, ResolvedPackage } from "./resolve.js";
export { isSafeName, parseNpmSource, resolvePackages } from "./resolve.js";
export { DEFAULT_SECTION_BYTE_CAP, formatExtensionsSection } from "./section.js";

export function resolveFromSettings(pi: ExtensionAPI, cwd: string): ResolvedPackage[] {
	let packages: unknown;
	try {
		packages = pi.getSettings().packages;
	} catch {
		packages = undefined;
	}
	return resolvePackages(packages, { agentDir: getAgentDir(), cwd, configDirName: CONFIG_DIR_NAME });
}

export default function register(pi: ExtensionAPI): void {
	let resolved: ResolvedPackage[] = [];

	pi.on("session_start", (_event, ctx) => {
		try {
			resolved = resolveFromSettings(pi, ctx.cwd);
		} catch {
			resolved = [];
		}
	});

	pi.on("before_agent_start", (event) => {
		const section = formatExtensionsSection(resolved);
		if (section === undefined) return;
		const options = event.systemPromptOptions;
		if (!options?.sections) return;
		options.sections.extensions = section;
	});

	registerSelfHelpCommand(pi, (ctx) => resolveFromSettings(pi, ctx.cwd));
}
