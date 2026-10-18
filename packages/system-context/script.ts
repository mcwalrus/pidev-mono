/**
 * Locate and run the package's SDK dump script through the host's exec.
 *
 * Another directory's prompt is reached by shelling out to `dump.ts`, never by
 * nesting a second SDK session inside the host.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SCRIPT_PATH = fileURLToPath(new URL("./dump.ts", import.meta.url));
export const DEFAULT_OUTPUT_FILE = "system-context.txt";

export interface CaptureRequest {
	cwd?: string;
	out?: string;
}

export interface CaptureInvocation {
	command: string;
	args: string[];
	outPath: string;
}

export interface CaptureOutcome {
	path: string;
	bytes: number;
}

/** Build the `node --experimental-strip-types dump.ts ...` invocation. */
export function buildInvocation(request: CaptureRequest, sessionCwd: string): CaptureInvocation {
	const targetDir = request.cwd ? resolve(sessionCwd, request.cwd) : sessionCwd;
	const outPath = request.out ? resolve(sessionCwd, request.out) : resolve(targetDir, DEFAULT_OUTPUT_FILE);
	return {
		command: "node",
		args: ["--experimental-strip-types", SCRIPT_PATH, targetDir, "--out", outPath],
		outPath,
	};
}

/**
 * Run the dump script and report the written path and prompt byte size. A
 * non-zero exit throws the script's reason so the caller never claims a capture
 * that did not happen.
 */
export async function captureScript(
	pi: ExtensionAPI,
	request: CaptureRequest,
	sessionCwd: string,
): Promise<CaptureOutcome> {
	const invocation = buildInvocation(request, sessionCwd);
	const result = await pi.exec(invocation.command, invocation.args);
	if (result.code !== 0) {
		const reason = result.stderr.trim() || `script exited with code ${result.code}`;
		throw new Error(reason);
	}
	const bytes = (await readFile(invocation.outPath)).length;
	return { path: invocation.outPath, bytes };
}
