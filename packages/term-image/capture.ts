import { execFileSync } from "node:child_process";

/** A tmux pane's size and its ANSI-escaped visible screen. */
export interface TmuxCapture {
	cols: number;
	rows: number;
	ansi: string;
}

/** Runs `file` with `args` and returns stdout as UTF-8. Injectable so tests avoid tmux. */
export type ExecFile = (file: string, args: string[]) => string;

function defaultExec(file: string, args: string[]): string {
	return execFileSync(file, args, { encoding: "utf8" });
}

/**
 * Read `target`'s size and screen via `tmux capture-pane -p -e`.
 *
 * `-e` is load-bearing: it emits SGR escapes for truecolor and attributes, which
 * `renderAnsiToPng` needs. Without it the grid would carry text but no colour.
 */
export function captureTmuxPane(target: string, exec: ExecFile = defaultExec): TmuxCapture {
	const size = exec("tmux", ["display-message", "-p", "-t", target, "#{pane_width} #{pane_height}"])
		.trim()
		.split(/\s+/);
	const cols = Number(size[0]);
	const rows = Number(size[1]);
	if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
		throw new Error(`Could not read pane size for tmux target "${target}"`);
	}
	const ansi = exec("tmux", ["capture-pane", "-p", "-e", "-t", target]);
	return { cols, rows, ansi };
}
