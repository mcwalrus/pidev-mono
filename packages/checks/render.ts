import type { CheckResult, CheckStore } from "./state/store.js";

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

/** Full command output: one line per check, plus a bounded stdout/stderr tail for anything that wrote. */
export function reportText(store: CheckStore): string {
	if (store.results.length === 0) return "No checks configured.";
	const lines = [headline(store) + lastRunSuffix(store)];
	for (const result of store.results) {
		lines.push(`${result.name}  ${result.state}  ${result.durationMs ?? "-"}ms  exit ${result.code ?? "-"}`);
	}
	for (const result of store.results) {
		const stdout = tail(result.stdout);
		const stderr = tail(result.stderr);
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

/** Keep the last `maxLines` lines, then the last `maxBytes` UTF-8 bytes. */
export function tail(text: string, maxLines = DEFAULT_TAIL_LINES, maxBytes = DEFAULT_TAIL_BYTES): string {
	if (text === "") return "";
	const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
	const bounded = lines.slice(-maxLines).join("\n");
	if (Buffer.byteLength(bounded, "utf8") <= maxBytes) return bounded;
	return Buffer.from(bounded, "utf8").subarray(-maxBytes).toString("utf8");
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
