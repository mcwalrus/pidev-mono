/**
 * Dump the system-context prompt Pi builds for a project, via the SDK.
 *
 * Pi only exposes this from inside a session, and the `pi-system-prompt-viewer`
 * extension's `/system-context` command is TUI-only. This script drives the SDK
 * directly and writes `session.systemPrompt` to stdout:
 *
 *   1. Build a session rooted at the target project, so Pi discovers that
 *      project's extensions, skills, context files and MCP servers.
 *   2. Resolve project trust from Pi's trust store. The SDK's default resource
 *      loader leaves projects untrusted, which suppresses project-local MCP.
 *   3. Bind extensions in TUI mode. Some extensions only contribute their
 *      direct tools to an interactive host; the MCP adapter is one.
 *
 * Usage:
 *   node --experimental-strip-types dump.ts [project-dir] [--settle-timeout ms]
 */

import { pathToFileURL } from "node:url";
import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ProjectTrustStore,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";

const TOOL_SETTLE_POLL_MS = 500;
const DEFAULT_SETTLE_TIMEOUT_MS = 15_000;

export interface DumpOptions {
	cwd: string;
	settleTimeoutMs: number;
}

export function parseArgs(argv: readonly string[], fallbackCwd = process.cwd()): DumpOptions {
	let cwd = fallbackCwd;
	let settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS;

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--settle-timeout") {
			const value = Number(argv[++index]);
			if (Number.isFinite(value) && value >= 0) settleTimeoutMs = value;
		} else if (!arg.startsWith("-")) {
			cwd = arg;
		}
	}

	return { cwd, settleTimeoutMs };
}

/**
 * Poll until the active tool count stops changing. MCP servers connect and
 * register their tools asynchronously after the extension bind, so a fixed wait
 * is either too short or needlessly slow.
 */
async function waitForToolsToSettle(session: { getActiveToolNames(): string[] }, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let previous = -1;

	while (Date.now() < deadline) {
		const count = session.getActiveToolNames().length;
		if (count > 0 && count === previous) return;
		previous = count;
		await new Promise((resolve) => setTimeout(resolve, TOOL_SETTLE_POLL_MS));
	}
}

export async function dumpSystemPrompt(options: DumpOptions): Promise<string> {
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(options.cwd, agentDir);
	const trusted = new ProjectTrustStore(agentDir).get(options.cwd) === true;

	const resourceLoader = new DefaultResourceLoader({ cwd: options.cwd, agentDir, settingsManager });
	await resourceLoader.reload({ resolveProjectTrust: async () => trusted });

	const { session } = await createAgentSession({
		cwd: options.cwd,
		agentDir,
		settingsManager,
		resourceLoader,
		sessionManager: SessionManager.inMemory(),
	});

	try {
		await session.bindExtensions({ mode: "tui" });
		await waitForToolsToSettle(session, options.settleTimeoutMs);
		return session.systemPrompt;
	} finally {
		session.dispose();
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	process.stdout.write(await dumpSystemPrompt(options));
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
