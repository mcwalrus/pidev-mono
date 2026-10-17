/** Lifecycle state of a single check. */
export type CheckState = "pending" | "running" | "passed" | "failed" | "timed_out" | "error";

export interface CheckResult {
	name: string;
	state: CheckState;
	code: number | null;
	durationMs: number | null;
	stdout: string;
	stderr: string;
	finishedAt: number | null;
}

/** Session-scoped results, owned by one extension instance. */
export interface CheckStore {
	results: CheckResult[];
	running: boolean;
	lastRunAt: number | null;
	/** Absolute path of the config file the results came from; `null` when none exists. */
	configPath: string | null;
}

export function createCheckStore(): CheckStore {
	return { results: [], running: false, lastRunAt: null, configPath: null };
}

/** Seed a pending result per definition so surfaces show every check before it runs. */
export function seedResults(definitions: ReadonlyArray<{ name: string }>): CheckResult[] {
	return definitions.map((definition) => ({
		name: definition.name,
		state: "pending",
		code: null,
		durationMs: null,
		stdout: "",
		stderr: "",
		finishedAt: null,
	}));
}
