/**
 * Dump the system-context prompt Pi builds for a project, via the SDK, and
 * optionally write it to a target file:
 *
 *   1. Build a session rooted at the target project, so Pi discovers that
 *      project's extensions, skills, context files and MCP servers.
 *   2. Resolve project trust from Pi's trust store. The SDK's default resource
 *      loader leaves projects untrusted, which suppresses project-local MCP.
 *   3. Bind extensions in TUI mode. Some extensions only contribute their
 *      direct tools to an interactive host; the MCP adapter is one.
 *
 * Usage:
 *   node --experimental-strip-types dump.ts [project-dir] [--out <file>] [--settle-timeout ms]
 *
 * With `--out` the prompt is written to that path and the path is printed to
 * stdout; without it the prompt goes to stdout. Diagnostics always go to
 * stderr so redirection never mixes them with the prompt.
 */

import { mkdir, writeFile as writeFileImpl } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TOOL_SETTLE_POLL_MS = 500;
export const DEFAULT_SETTLE_TIMEOUT_MS = 15_000;

export interface ParsedArgs {
	cwd: string;
	settleTimeoutMs: number;
	out: string | undefined;
}

export interface DumpOptions extends ParsedArgs {
	log: (message: string) => void;
}

/** The two effects `main` performs, injectable so tests stay off a real session. */
export interface DumpDependencies {
	produce: (options: DumpOptions) => Promise<string>;
	writeFile: (path: string, content: string) => Promise<void>;
}

export interface DumpResult {
	code: number;
	outPath?: string;
	stdout: string;
	stderr: string;
}

export function parseArgs(argv: readonly string[], fallbackCwd = process.cwd()): ParsedArgs {
	let cwd = fallbackCwd;
	let settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS;
	let out: string | undefined;

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--out") {
			out = argv[++index];
		} else if (arg === "--settle-timeout") {
			const value = Number(argv[++index]);
			if (Number.isFinite(value) && value >= 0) settleTimeoutMs = value;
		} else if (!arg.startsWith("-")) {
			cwd = arg;
		}
	}

	return { cwd, settleTimeoutMs, out };
}

/**
 * Poll until the active tool count stops changing. MCP servers connect and
 * register their tools asynchronously after the extension bind, so a fixed wait
 * is either too short or needlessly slow.
 */
async function waitForToolsToSettle(
	session: { getActiveToolNames(): string[] },
	timeoutMs: number,
	log: (message: string) => void,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let previous = -1;

	while (Date.now() < deadline) {
		const count = session.getActiveToolNames().length;
		if (count > 0 && count === previous) {
			log(`active tools settled at ${count}`);
			return;
		}
		previous = count;
		await new Promise((finish) => setTimeout(finish, TOOL_SETTLE_POLL_MS));
	}
	log(`active tools did not settle within ${timeoutMs}ms`);
}

export async function dumpSystemPrompt(options: DumpOptions): Promise<string> {
	const {
		createAgentSession,
		DefaultResourceLoader,
		getAgentDir,
		ProjectTrustStore,
		SessionManager,
		SettingsManager,
	} = await import("@earendil-works/pi-coding-agent");
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(options.cwd, agentDir);
	const trusted = new ProjectTrustStore(agentDir).get(options.cwd) === true;
	options.log(`project trust for ${options.cwd}: ${trusted ? "trusted" : "untrusted"}`);

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
		await waitForToolsToSettle(session, options.settleTimeoutMs, options.log);
		return session.systemPrompt;
	} finally {
		session.dispose();
	}
}

/**
 * Resolve and emit the prompt. Returns the streams instead of writing them so
 * the failure paths are testable; the direct-invocation wrapper flushes them.
 */
export async function main(argv = process.argv.slice(2), deps: Partial<DumpDependencies> = {}): Promise<DumpResult> {
	const parsed = parseArgs(argv);
	const diagnostics: string[] = [];
	const log = (message: string) => {
		diagnostics.push(message.endsWith("\n") ? message : `${message}\n`);
	};
	const produce = deps.produce ?? dumpSystemPrompt;
	const writeFile = deps.writeFile ?? writeFileImpl;

	try {
		const prompt = await produce({ ...parsed, log });
		if (parsed.out === undefined) {
			return { code: 0, stdout: prompt, stderr: diagnostics.join("") };
		}
		const outPath = resolve(parsed.out);
		await mkdir(dirname(outPath), { recursive: true });
		await writeFile(outPath, prompt);
		return { code: 0, outPath, stdout: `${outPath}\n`, stderr: diagnostics.join("") };
	} catch (error) {
		log(error instanceof Error ? error.message : String(error));
		return { code: 1, stdout: "", stderr: diagnostics.join("") };
	}
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
	main().then((result) => {
		if (result.stdout) process.stdout.write(result.stdout);
		if (result.stderr) process.stderr.write(result.stderr);
		process.exitCode = result.code;
	});
}
