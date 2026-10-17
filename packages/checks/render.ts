import type { CheckResult, CheckState, CheckStore } from "./state/store.js";

export interface Foreground {
	fg(color: string, text: string): string;
}

export type Aggregate = "all-passed" | "attention" | "neutral";

const identityForeground: Foreground = { fg: (_color, text) => text };
const MAX_ATTENTION_NAMES = 5;

/** Serialised tail limits shared by `/checks` stdout and stderr. */
export const DEFAULT_TAIL_LINES = 20;
export const DEFAULT_TAIL_BYTES = 4096;

/**
 * Neutral until a run settles: green only when at least one check ran and every
 * result passed; otherwise red for a settled non-passed result. Pending or
 * running results keep the aggregate neutral so startup never flashes a warning.
 */
export function aggregateOf(results: readonly CheckResult[]): Aggregate {
	if (results.length === 0) return "neutral";
	if (results.some((result) => result.state === "pending" || result.state === "running")) return "neutral";
	return results.every((result) => result.state === "passed") ? "all-passed" : "attention";
}

/** A check whose state differs between two runs. */
export interface CheckTransition {
	name: string;
	from: CheckState;
	to: CheckState;
}

/** Transitions between two settled runs, by name, in the order of `next`. */
export function stateChanges(previous: readonly CheckResult[], next: readonly CheckResult[]): CheckTransition[] {
	const before = new Map(previous.map((result) => [result.name, result.state]));
	const changes: CheckTransition[] = [];
	for (const result of next) {
		const from = before.get(result.name);
		if (from === undefined || from === result.state) continue;
		changes.push({ name: result.name, from, to: result.state });
	}
	return changes;
}

/**
 * Model-facing note for the next prompt: where the checks stand and what
 * changed since the previous run. `undefined` when nothing changed.
 */
export function changeNotice(previous: readonly CheckResult[], next: readonly CheckResult[]): string | undefined {
	const changes = stateChanges(previous, next);
	if (changes.length === 0) return undefined;
	const passed = next.filter((result) => result.state === "passed").length;
	const improved = changes.every((change) => change.to === "passed");
	const delta = changes.map((change) => `${change.name}: ${change.from} -> ${change.to}`).join(", ");
	return `Environment precondition ${improved ? "improved" : "changed"}: ${delta}. Checks now ${passed}/${next.length} pass.`;
}

/** Lines for the widget beside the editor, coloured by the aggregate. */
export function widgetLines(store: CheckStore, foreground: Foreground = identityForeground): string[] {
	if (store.results.length === 0) return [foreground.fg("muted", "No checks configured")];
	const lines = [foreground.fg(aggregateColour(store), headline(store) + lastRunSuffix(store))];
	if (!store.running) {
		const attention = store.results.filter((result) => result.state !== "passed").map((result) => result.name);
		if (attention.length > 0) lines.push(foreground.fg("error", `Needs attention: ${boundedNames(attention)}`));
	}
	lines.push(foreground.fg("muted", "Run /checks to inspect"));
	return lines;
}

/** Compact footer indicator. `undefined` clears it (empty config). */
export function statusText(store: CheckStore, foreground: Foreground = identityForeground): string | undefined {
	if (store.results.length === 0) return undefined;
	return foreground.fg(aggregateColour(store), `checks ${passedCount(store)}/${store.results.length}`);
}

/** One-line model-facing summary of the current session results. Never includes captured output. */
export function checkSummary(store: CheckStore): string {
	if (store.results.length === 0) return "none configured";
	if (store.running || store.results.some((result) => result.state === "pending" || result.state === "running")) {
		return "still running";
	}
	const passed = passedCount(store);
	if (passed === store.results.length) return "all passed";
	const attention = store.results
		.filter((result) => result.state !== "passed")
		.map((result) => `${result.name} ${result.state}`)
		.join(", ");
	return `${passed} of ${store.results.length} passed: ${attention}`;
}

/** One check's exit code and bounded output tail, for a model that names a check. */
export function checkDetail(store: CheckStore, name: string): string {
	const result = store.results.find((candidate) => candidate.name === name);
	if (result === undefined) return `No check named "${name}".`;
	const lines = [`${result.name}  ${result.state}  ${result.durationMs ?? "-"}ms  exit ${result.code ?? "-"}`];
	const { stdout, stderr } = boundedStreams(result);
	if (stdout) lines.push("stdout:", indent(stdout));
	if (stderr) lines.push("stderr:", indent(stderr));
	if (!stdout && !stderr && result.state !== "passed") lines.push(`no output captured (exit ${result.code ?? "-"})`);
	return lines.join("\n");
}

/** Full command output: one line per check, plus a bounded stdout/stderr tail for anything that wrote. */
export function reportText(store: CheckStore): string {
	if (store.results.length === 0) return "No checks configured.";
	const lines = [headline(store) + lastRunSuffix(store)];
	for (const result of store.results) {
		lines.push(`${result.name}  ${result.state}  ${result.durationMs ?? "-"}ms  exit ${result.code ?? "-"}`);
	}
	for (const result of store.results) {
		const { stdout, stderr } = boundedStreams(result);
		if (!stdout && !stderr && result.state === "passed") continue;
		lines.push("", `${result.name} (${result.state})`);
		if (stdout) lines.push("stdout:", indent(stdout));
		if (stderr) lines.push("stderr:", indent(stderr));
		if (!stdout && !stderr) lines.push(`no output captured (exit ${result.code ?? "-"})`);
	}
	return lines.join("\n");
}

/** Notification severity for the `/checks` report: red when any settled check needs attention. */
export function reportType(store: CheckStore): "info" | "error" {
	return aggregateOf(store.results) === "attention" ? "error" : "info";
}

/** Keep the last `maxLines` lines, then the last `maxBytes` UTF-8 bytes without splitting a code point. */
export function tail(text: string, maxLines = DEFAULT_TAIL_LINES, maxBytes = DEFAULT_TAIL_BYTES): string {
	if (text === "") return "";
	const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
	const bounded = lines.slice(-maxLines).join("\n");
	const buffer = Buffer.from(bounded, "utf8");
	if (buffer.length <= maxBytes) return bounded;
	let start = buffer.length - maxBytes;
	while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start += 1;
	return buffer.subarray(start).toString("utf8");
}

function boundedStreams(result: CheckResult): { stdout: string; stderr: string } {
	return { stdout: tail(result.stdout), stderr: tail(result.stderr) };
}

function boundedNames(names: readonly string[]): string {
	if (names.length <= MAX_ATTENTION_NAMES) return names.join(", ");
	return `${names.slice(0, MAX_ATTENTION_NAMES).join(", ")} +${names.length - MAX_ATTENTION_NAMES} more`;
}

function headline(store: CheckStore): string {
	const prefix = store.running ? "Checks running: " : "Checks: ";
	return `${prefix}${passedCount(store)}/${store.results.length} passed`;
}

function passedCount(store: CheckStore): number {
	return store.results.filter((result) => result.state === "passed").length;
}

function aggregateColour(store: CheckStore): string {
	const aggregate = aggregateOf(store.results);
	if (aggregate === "all-passed") return "success";
	if (aggregate === "attention") return "error";
	return "muted";
}

function lastRunSuffix(store: CheckStore): string {
	if (store.running || store.lastRunAt === null) return "";
	return ` — last run ${formatClock(store.lastRunAt)}`;
}

function formatClock(timestamp: number): string {
	return new Date(timestamp).toTimeString().slice(0, 8);
}

function indent(text: string): string {
	return text
		.split("\n")
		.map((line) => `  ${line}`)
		.join("\n");
}
