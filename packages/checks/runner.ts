import type { ExecOptions, ExecResult } from "@earendil-works/pi-coding-agent";
import { type CheckDefinition, DEFAULT_TIMEOUT_MS } from "./config.js";
import { type CheckResult, seedResults } from "./state/store.js";

export const DEFAULT_CONCURRENCY = 4;

export type CheckExecutor = (command: string, args: string[], options: ExecOptions) => Promise<ExecResult>;

export interface RunChecksOptions {
	/** Working directory for checks that declare no `cwd`. */
	cwd: string;
	signal?: AbortSignal;
	concurrency?: number;
	onUpdate?: (results: CheckResult[]) => void;
}

/**
 * Run every definition once, concurrently under a cap, resolving to results in
 * config order. A rejected executor maps to `error`; a killed process maps to
 * `timed_out`; a non-zero exit maps to `failed`; exit zero and not killed maps
 * to `passed`. One check's outcome never stops another.
 */
export async function runChecks(
	definitions: readonly CheckDefinition[],
	executor: CheckExecutor,
	options: RunChecksOptions,
): Promise<CheckResult[]> {
	const results = seedResults(definitions);
	const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
	let next = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			if (options.signal?.aborted) return;
			const index = next++;
			if (index >= definitions.length) return;
			const definition = definitions[index]!;
			results[index] = { ...results[index]!, state: "running" };
			options.onUpdate?.([...results]);
			results[index] = await runOne(definition, executor, options);
			options.onUpdate?.([...results]);
		}
	};

	await Promise.all(Array.from({ length: Math.min(concurrency, definitions.length) }, worker));
	return results;
}

async function runOne(
	definition: CheckDefinition,
	executor: CheckExecutor,
	options: RunChecksOptions,
): Promise<CheckResult> {
	const startedAt = Date.now();
	try {
		const result = await executor(definition.command, definition.args ?? [], {
			cwd: definition.cwd ?? options.cwd,
			timeout: definition.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			signal: options.signal,
		});
		const finishedAt = Date.now();
		const base = {
			name: definition.name,
			code: result.code,
			durationMs: finishedAt - startedAt,
			stdout: result.stdout,
			stderr: result.stderr,
			finishedAt,
		};
		if (result.killed) return { ...base, state: "timed_out" };
		return { ...base, state: result.code === 0 ? "passed" : "failed" };
	} catch (error) {
		// `pi.exec` never rejects on a spawn failure (it resolves code 1), so this is
		// only for an executor that itself rejects, e.g. invalid spawn arguments.
		const finishedAt = Date.now();
		return {
			name: definition.name,
			state: "error",
			code: null,
			durationMs: finishedAt - startedAt,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
			finishedAt,
		};
	}
}
