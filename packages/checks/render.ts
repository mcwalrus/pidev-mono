import type { CheckResult, CheckStore } from "./state/store.js";

export interface Foreground {
	fg(color: string, text: string): string;
}

export type Aggregate = "all-passed" | "attention" | "neutral";

const identityForeground: Foreground = { fg: (_color, text) => text };

/** Green only when at least one check ran and every result passed; empty config is neutral. */
export function aggregateOf(results: readonly CheckResult[]): Aggregate {
	if (results.length === 0) return "neutral";
	return results.every((result) => result.state === "passed") ? "all-passed" : "attention";
}

/** Lines for the widget beside the editor, coloured by the aggregate. */
export function widgetLines(store: CheckStore, foreground: Foreground = identityForeground): string[] {
	if (store.results.length === 0) return [foreground.fg("muted", "No checks configured")];
	const lines = [foreground.fg(aggregateColour(store), headline(store) + lastRunSuffix(store))];
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
		lines.push(`${result.name}  ${result.state}  ${result.durationMs ?? "-"}ms`);
	}
	for (const result of store.results) {
		const stdout = tail(result.stdout);
		const stderr = tail(result.stderr);
		if (!stdout && !stderr) continue;
		lines.push("", `${result.name} (${result.state})`);
		if (stdout) lines.push("stdout:", indent(stdout));
		if (stderr) lines.push("stderr:", indent(stderr));
	}
	return lines.join("\n");
}

/** Keep the last `maxLines` lines, dropping a single trailing newline first. */
export function tail(text: string, maxLines = 20): string {
	if (text === "") return "";
	const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
	return lines.slice(-maxLines).join("\n");
}

function headline(store: CheckStore): string {
	const prefix = store.running ? "Checks running: " : "Checks: ";
	return `${prefix}${passedCount(store)}/${store.results.length} passed`;
}

function passedCount(store: CheckStore): number {
	return store.results.filter((result) => result.state === "passed").length;
}

function aggregateColour(store: CheckStore): string {
	return aggregateOf(store.results) === "all-passed" ? "success" : "warning";
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
